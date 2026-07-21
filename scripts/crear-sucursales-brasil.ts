/**
 * Setup para las sucursales de Brasil de Akakua'a:
 *   - Sucursal El Dorado (moneda BRL)
 *   - Sucursal Betim (moneda BRL)
 *   - Sucursal BH (moneda BRL)
 *
 * Y sus 3 usuarios operativos (rol=usuario, lang=pt-BR), cada uno
 * asignado a su sucursal + con los 4 módulos: clientes, atencion (Caja),
 * inventario, compras.
 *
 * Uso: npx tsx scripts/crear-sucursales-brasil.ts
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Requiere primero aplicar migración 20260827000000_pronimerp_moneda_lang.sql.
 */
import { config } from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: path.join(process.cwd(), ".env.local") });

const SCHEMA = "pronimerp";
const EMPRESA_SLUG = "akakua"; // ajustar si es distinto en tu tenant

const SUCURSALES = [
  { nombre: "El Dorado", slug: "el-dorado", moneda: "BRL" },
  { nombre: "Betim",     slug: "betim",     moneda: "BRL" },
  { nombre: "BH",        slug: "bh",        moneda: "BRL" },
];

const USUARIOS = [
  { email: "usuario@eldorado.com", nombre: "Operador El Dorado", password: "Akakua2026", sucursalSlug: "el-dorado" },
  { email: "usuario@betim.com",    nombre: "Operador Betim",     password: "Akakua2026", sucursalSlug: "betim"     },
  { email: "usuario@bh.com",       nombre: "Operador BH",        password: "Akakua2026", sucursalSlug: "bh"        },
];

const MODULOS_SLUGS = ["clientes", "atencion", "inventario", "compras"];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: SCHEMA },
  });

  // 1) Empresa
  const { data: empresa, error: eEmp } = await sb
    .from("empresas")
    .select("id, nombre")
    .ilike("slug", EMPRESA_SLUG)
    .maybeSingle();
  if (eEmp || !empresa) {
    console.error(`No se encontró empresa slug=${EMPRESA_SLUG}. ${eEmp?.message ?? ""}`);
    console.error("Editá EMPRESA_SLUG en el script con el slug real.");
    process.exit(1);
  }
  const empresaId = (empresa as { id: string }).id;
  console.log(`Empresa: ${(empresa as { nombre: string }).nombre} (${empresaId})`);

  // 2) Sucursales — upsert por (empresa_id, slug)
  const sucIds: Record<string, string> = {};
  for (const s of SUCURSALES) {
    const { data: existing } = await sb
      .from("sucursales")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("slug", s.slug)
      .maybeSingle();
    if (existing?.id) {
      const { error: eu } = await sb
        .from("sucursales")
        .update({ nombre: s.nombre, moneda: s.moneda, activo: true })
        .eq("id", existing.id);
      if (eu) { console.error(`update sucursal ${s.slug}:`, eu.message); process.exit(1); }
      sucIds[s.slug] = existing.id as string;
      console.log(`✓ Sucursal existente actualizada: ${s.nombre} (moneda=${s.moneda})`);
    } else {
      const { data: ins, error: ei } = await sb
        .from("sucursales")
        .insert({ empresa_id: empresaId, nombre: s.nombre, slug: s.slug, moneda: s.moneda, es_principal: false, activo: true })
        .select("id")
        .single();
      if (ei) { console.error(`insert sucursal ${s.slug}:`, ei.message); process.exit(1); }
      sucIds[s.slug] = (ins as { id: string }).id;
      console.log(`✓ Sucursal creada: ${s.nombre} (moneda=${s.moneda})`);
    }
  }

  // 3) Módulos: buscar los ids por slug.
  const { data: modulos, error: eMod } = await sb
    .from("modulos")
    .select("id, slug")
    .in("slug", MODULOS_SLUGS);
  if (eMod) { console.error("select modulos:", eMod.message); process.exit(1); }
  const moduloIds = (modulos ?? []) as { id: string; slug: string }[];
  const missingMods = MODULOS_SLUGS.filter(s => !moduloIds.find(m => m.slug === s));
  if (missingMods.length > 0) {
    console.error(`Faltan módulos en la tabla modulos: ${missingMods.join(", ")}`);
    process.exit(1);
  }

  // Garantizar que la empresa tenga esos módulos habilitados (empresa_modulos).
  for (const m of moduloIds) {
    const { data: em } = await sb
      .from("empresa_modulos")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("modulo_id", m.id)
      .maybeSingle();
    if (!em) {
      const { error: eemi } = await sb
        .from("empresa_modulos")
        .insert({ empresa_id: empresaId, modulo_id: m.id, activo: true });
      if (eemi) { console.error(`insert empresa_modulos ${m.slug}:`, eemi.message); process.exit(1); }
      console.log(`  · Habilitado módulo empresa: ${m.slug}`);
    } else {
      await sb.from("empresa_modulos").update({ activo: true }).eq("id", em.id);
    }
  }

  // 4) Usuarios
  for (const u of USUARIOS) {
    const sucursalId = sucIds[u.sucursalSlug];
    if (!sucursalId) { console.error(`Sucursal ${u.sucursalSlug} no encontrada`); process.exit(1); }

    const emailLc = u.email.toLowerCase();

    // 4a) Auth user
    let authUserId: string | undefined;
    const { data: created, error: eCreate } = await sb.auth.admin.createUser({
      email: emailLc, password: u.password, email_confirm: true,
    });
    if (eCreate) {
      const alreadyExists = /already.*(registered|exists)/i.test(eCreate.message ?? "");
      if (!alreadyExists) { console.error(`auth create ${emailLc}:`, eCreate.message); process.exit(1); }
      // buscar existente
      for (let page = 1; page <= 20 && !authUserId; page++) {
        const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        const f = list?.users?.find(x => (x.email ?? "").toLowerCase() === emailLc);
        if (f) authUserId = f.id;
        if (!list?.users?.length) break;
      }
      if (!authUserId) { console.error(`no se ubicó auth user ${emailLc}`); process.exit(1); }
      await sb.auth.admin.updateUserById(authUserId, { password: u.password, email_confirm: true });
      console.log(`  · Auth user existía, password reset: ${emailLc}`);
    } else {
      authUserId = created?.user?.id;
      console.log(`  · Auth user creado: ${emailLc}`);
    }

    if (!authUserId) { console.error(`sin authUserId para ${emailLc}`); process.exit(1); }

    // 4b) pronimerp.usuarios
    const { data: exU } = await sb
      .from("usuarios")
      .select("id")
      .ilike("email", emailLc)
      .maybeSingle();

    let usuarioId: string;
    if (exU?.id) {
      const { error: euu } = await sb
        .from("usuarios")
        .update({
          nombre: u.nombre,
          rol: "usuario",
          empresa_id: empresaId,
          sucursal_id: sucursalId,
          lang: "pt-BR",
          auth_user_id: authUserId,
          estado: "activo",
          activo: true,
        })
        .eq("id", exU.id);
      if (euu) { console.error(`update usuario ${emailLc}:`, euu.message); process.exit(1); }
      usuarioId = exU.id as string;
    } else {
      const { data: insU, error: eiu } = await sb
        .from("usuarios")
        .insert({
          email: emailLc,
          nombre: u.nombre,
          rol: "usuario",
          empresa_id: empresaId,
          sucursal_id: sucursalId,
          lang: "pt-BR",
          auth_user_id: authUserId,
          estado: "activo",
          activo: true,
        })
        .select("id")
        .single();
      if (eiu) { console.error(`insert usuario ${emailLc}:`, eiu.message); process.exit(1); }
      usuarioId = (insU as { id: string }).id;
    }

    // 4c) usuario_modulos — reemplazar por los 4 permitidos
    const { error: eDel } = await sb.from("usuario_modulos").delete().eq("usuario_id", usuarioId);
    if (eDel) { console.error(`del usuario_modulos ${emailLc}:`, eDel.message); process.exit(1); }
    const rows = moduloIds.map(m => ({ usuario_id: usuarioId, modulo_id: m.id }));
    const { error: eIns } = await sb.from("usuario_modulos").insert(rows);
    if (eIns) { console.error(`ins usuario_modulos ${emailLc}:`, eIns.message); process.exit(1); }

    console.log(`✓ Usuario listo: ${emailLc} → ${u.sucursalSlug} (pt-BR, 4 módulos)`);
  }

  console.log("\nHecho. Login inicial:");
  for (const u of USUARIOS) console.log(`  ${u.email}  password: ${u.password}`);
}

main().catch(e => { console.error(e); process.exit(1); });
