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

function playNotes(
  notes: number[],
  { stepMs = 120, durMs = 350, gain = 0.18 }: { stepMs?: number; durMs?: number; gain?: number } = {},
) {
  const c = ensureContext();
  if (!c) return;
  const doPlay = () => {
    if (!c) return;
    if (c.state === "suspended") { void c.resume(); }
    const now = c.currentTime;
    notes.forEach((freq, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = now + (i * stepMs) / 1000;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + durMs / 1000);
      o.connect(g).connect(c.destination);
      o.start(start);
      o.stop(start + durMs / 1000 + 0.05);
    });
  };
  if (!unlocked) {
    // Encolamos y esperamos primera interacción. Si el usuario nunca
    // interactúa, se pierde — pero es lo esperable en autoplay policy.
    pendingBeforeUnlock.push(doPlay);
    return;
  }
  doPlay();
}

/** "Ding-ding-ding" ascendente (C5 → E5 → G5). Meta alcanzada. */
export function playCelebrationSound() {
  playNotes([523.25, 659.25, 783.99], { stepMs: 120, durMs: 350 });
}

/** "Bloop" descendente (A5 → E5). Notificación no-celebratoria. */
export function playNotifSound() {
  playNotes([880, 660], { stepMs: 90, durMs: 220, gain: 0.12 });
}
