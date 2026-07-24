/**
 * Sonidos de notificación con "unlock" de WebAudio.
 *
 * Los navegadores bloquean AudioContext hasta la primera interacción del
 * usuario (política autoplay). Antes hacíamos `new AudioContext()` dentro
 * de un `setInterval`/fetch, así que quedaba `suspended` para siempre.
 *
 * Este módulo:
 *   1. Instala listeners globales de `pointerdown`/`keydown` en el mount.
 *   2. En la primera interacción crea el AudioContext + lo resume + toca
 *      un buffer silencioso para "desbloquear" el ciclo de audio en iOS.
 *   3. Deja el contexto vivo para el resto de la sesión.
 *   4. Expone `playCelebrationSound()` y `playNotifSound()` — si aún no
 *      se desbloqueó, encola el sonido para dispararlo apenas se
 *      desbloquee (así la primera notificación no se pierde).
 *
 * Uso: importar y llamar directamente; no requiere React ni provider.
 * En el mount de la app llamar `initNotifSounds()` una vez para
 * garantizar que los listeners están instalados.
 */

let ctx: AudioContext | null = null;
let unlocked = false;
const pendingBeforeUnlock: Array<() => void> = [];
let initialized = false;
// Elemento HTMLAudio precargado para el mp3 de notificación. Se "arma"
// en el primer gesto del usuario (play + pause inmediato) para que
// llamadas posteriores desde el poll ya no estén bloqueadas por
// autoplay policy.
let notifAudioPrimed = false;

type ACConstructor = typeof AudioContext;

function getACCtor(): ACConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: ACConstructor; webkitAudioContext?: ACConstructor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = getACCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

async function unlock() {
  if (unlocked) return;
  const c = ensureContext();
  if (!c) return;
  try {
    if (c.state === "suspended") await c.resume();
    // Buffer silencioso — truco clásico para desbloquear iOS y algunos
    // Chromium con políticas estrictas.
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
    unlocked = true;
    // "Primar" el elemento HTMLAudio del mp3 de notif — un play() en
    // volumen 0 dentro del mismo gesto lo whitelistea para plays
    // futuros disparados desde timers/fetch.
    try {
      const primer = new Audio(NOTIF_MP3);
      primer.volume = 0;
      await primer.play().catch(() => { /* ignore */ });
      primer.pause();
      primer.currentTime = 0;
      notifAudioPrimed = true;
    } catch { /* ignore */ }
    // Drenar cualquier sonido pendiente que llegó antes de la interacción.
    while (pendingBeforeUnlock.length > 0) {
      const fn = pendingBeforeUnlock.shift();
      try { fn?.(); } catch { /* ignore */ }
    }
  } catch {
    /* ignore — al menos ya intentamos */
  }
}

/**
 * Instala los listeners globales para desbloquear el audio en la primera
 * interacción. Idempotente — múltiples llamadas no duplican listeners.
 */
export function initNotifSounds() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const onGesture = () => { void unlock(); };
  // `pointerdown` cubre mouse + touch. `keydown` para navegación por
  // teclado. Ambos con `once: true` no alcanza porque queremos capturar
  // hasta que realmente desbloqueemos.
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture, { passive: true });
  window.addEventListener("click", onGesture, { passive: true });
}

type NoteSpec = {
  freq: number;
  /** delay desde el inicio en ms */
  at: number;
  /** duración en ms */
  dur?: number;
  /** volumen 0-1 */
  gain?: number;
  /** timbre */
  type?: OscillatorType;
};

function playNotes(notes: NoteSpec[]) {
  const c = ensureContext();
  if (!c) return;
  const doPlay = () => {
    if (!c) return;
    if (c.state === "suspended") { void c.resume(); }
    const now = c.currentTime;
    // Master gain para no clippear cuando se solapan notas.
    const master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    notes.forEach((n) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = n.type ?? "sine";
      o.frequency.value = n.freq;
      const start = now + n.at / 1000;
      const dur = (n.dur ?? 350) / 1000;
      const peak = n.gain ?? 0.3;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(master);
      o.start(start);
      o.stop(start + dur + 0.05);
    });
  };
  if (!unlocked) {
    pendingBeforeUnlock.push(doPlay);
    return;
  }
  doPlay();
}

/**
 * Meta alcanzada — fanfare de 5 notas con timbre triangular (más brillante
 * que sine, no tan agresivo como square). Volumen alto para que se oiga
 * sobre el ruido de una tienda. Arpegio C-E-G-C-G en dos tiempos.
 */
export function playCelebrationSound() {
  playNotes([
    { freq: 523.25, at:   0, dur: 180, gain: 0.35, type: "triangle" }, // C5
    { freq: 659.25, at:  90, dur: 180, gain: 0.35, type: "triangle" }, // E5
    { freq: 783.99, at: 180, dur: 200, gain: 0.35, type: "triangle" }, // G5
    { freq: 1046.5, at: 320, dur: 420, gain: 0.40, type: "triangle" }, // C6 largo
    { freq:  783.99, at: 320, dur: 420, gain: 0.25, type: "triangle" }, // G5 armónico
  ]);
}

/**
 * Notificación — MP3 provisto por Karen. Usamos HTMLAudioElement en vez
 * de WebAudio porque el mp3 ya es el sonido final. Cada llamada crea un
 * elemento nuevo para permitir solapamientos (N pendientes → N bloops
 * separados por el delay del Header).
 *
 * Volumen fijo a 0.7. Si el navegador todavía no desbloqueó el audio,
 * el play() puede rechazar silenciosamente — no hace falta encolarlo
 * porque el listener de `pointerdown` ya habilita el audio para el
 * próximo bloop.
 */
const NOTIF_MP3 = "/sounds/universfield-new-notification-051-494246.mp3";
function playNotifMp3() {
  if (typeof window === "undefined") return;
  try {
    const a = new Audio(NOTIF_MP3);
    a.volume = 0.7;
    void a.play().catch(() => { /* autoplay bloqueado — se ignora */ });
  } catch { /* ignore */ }
}
export function playNotifSound() {
  // Si todavía no hubo gesto del usuario, encolamos — se dispara al
  // desbloquear (mismo mecanismo que WebAudio). Después del primer
  // gesto ya suena directo.
  if (!unlocked || !notifAudioPrimed) {
    pendingBeforeUnlock.push(playNotifMp3);
    return;
  }
  playNotifMp3();
}

// ═══════════ Variantes de prueba — para que Karen elija cuál le gusta ══════════

/** Cash register "cha-ching" — dos golpes brillantes. */
export function playChaChing() {
  playNotes([
    { freq: 1568, at:  0, dur: 90,  gain: 0.35, type: "square" },
    { freq: 2093, at: 40, dur: 180, gain: 0.30, type: "triangle" },
    { freq: 1568, at: 200, dur: 90, gain: 0.30, type: "square" },
    { freq: 2093, at: 240, dur: 250, gain: 0.28, type: "triangle" },
  ]);
}

/** Campanita suave — bell chime. */
export function playChime() {
  playNotes([
    { freq: 1046.5, at:  0, dur: 900, gain: 0.30, type: "sine" },
    { freq: 1318.5, at:  0, dur: 900, gain: 0.20, type: "sine" },
    { freq: 1568.0, at:  0, dur: 900, gain: 0.15, type: "sine" },
  ]);
}

/** Fanfare largo — 6 notas ascendentes. Más celebratorio. */
export function playFanfare() {
  playNotes([
    { freq: 523.25, at:   0, dur: 140, gain: 0.35, type: "triangle" },
    { freq: 659.25, at:  90, dur: 140, gain: 0.35, type: "triangle" },
    { freq: 783.99, at: 180, dur: 140, gain: 0.35, type: "triangle" },
    { freq: 1046.5, at: 270, dur: 140, gain: 0.38, type: "triangle" },
    { freq: 1318.5, at: 360, dur: 140, gain: 0.40, type: "triangle" },
    { freq: 1568.0, at: 450, dur: 600, gain: 0.42, type: "triangle" },
    { freq: 1046.5, at: 450, dur: 600, gain: 0.25, type: "triangle" },
  ]);
}

/** Ping simple — un único tono claro. */
export function playPing() {
  playNotes([
    { freq: 1760, at: 0, dur: 350, gain: 0.32, type: "triangle" },
  ]);
}
