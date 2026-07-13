/**
 * Crea (o resetea) el usuario super_admin en Supabase Auth y lo enlaza a
 * pronimerp.usuarios como super_admin.
 *
 * Uso: npx tsx scripts/crear-super-admin.ts
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: path.join(process.cwd(), ".env.local") });

const EMAIL = "admin@pronimconsultoria.com";
const PASSWORD = "Pronimconsultoria2026";
const NOMBRE = "Admin Akakua'a";
const SCHEMA = "pronimerp";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: SCHEMA },
  });

  const emailLc = EMAIL.toLowerCase();
  console.log(`Creando/actualizando super_admin: ${emailLc} (schema=${SCHEMA})`);

  // 1) Crear en Supabase Auth (o resetear password si ya existe)
  let authUserId: string | undefined;
  const { data: created, error: errCreate } = await supabase.auth.admin.createUser({
    email: emailLc,
    password: PASSWORD,
    email_confirm: true,
  });

  if (errCreate) {
    const msg = errCreate.message ?? "";
    const alreadyExists =
      msg.includes("already been registered") ||
      msg.includes("already registered") ||
      msg.toLowerCase().includes("already exists");

    if (!alreadyExists) {
      console.error("Error creando usuario en Auth:", msg);
      process.exit(1);
    }

    console.log("Usuario ya existe en Auth. Buscando y actualizando password...");

    // Buscar entre páginas por si hay muchos usuarios
    let found: { id: string; email?: string | null } | undefined;
    for (let page = 1; page <= 20 && !found; page++) {
      const { data: list, error: errList } = await supabase.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (errList) {
        console.error("Error listando usuarios de Auth:", errList.message);
        process.exit(1);
      }
      found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === emailLc);
      if (!list?.users?.length) break;
    }

    if (!found) {
      console.error("No se pudo localizar el usuario existente en Auth.");
      process.exit(1);
    }

    authUserId = found.id;
    const { error: errUpd } = await supabase.auth.admin.updateUserById(found.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (errUpd) {
      console.error("Error actualizando password:", errUpd.message);
      process.exit(1);
    }
    console.log("Password actualizada en Auth.");
  } else {
    authUserId = created?.user?.id;
    console.log("Usuario creado en Supabase Auth.");
  }

  if (!authUserId) {
    console.error("No se obtuvo auth_user_id.");
    process.exit(1);
  }

  // 2) Upsert en pronimerp.usuarios
  const { data: existente, error: errSel } = await supabase
    .from("usuarios")
    .select("id, rol, auth_user_id")
    .ilike("email", emailLc)
    .maybeSingle();

  if (errSel) {
    console.error(`Error consultando ${SCHEMA}.usuarios:`, errSel.message);
    process.exit(1);
  }

  if (existente) {
    const { error: errUpd } = await supabase
      .from("usuarios")
      .update({
        nombre: NOMBRE,
        rol: "super_admin",
        empresa_id: null,
        auth_user_id: authUserId,
        estado: "activo",
        activo: true,
      })
      .eq("id", existente.id);

    if (errUpd) {
      console.error(`Error actualizando ${SCHEMA}.usuarios:`, errUpd.message);
      process.exit(1);
    }
    console.log(`Fila actualizada en ${SCHEMA}.usuarios (rol=super_admin).`);
  } else {
    const { error: errIns } = await supabase.from("usuarios").insert([
      {
        email: emailLc,
        nombre: NOMBRE,
        rol: "super_admin",
        empresa_id: null,
        auth_user_id: authUserId,
        estado: "activo",
        activo: true,
      },
    ]);
    if (errIns) {
      console.error(`Error insertando en ${SCHEMA}.usuarios:`, errIns.message);
      process.exit(1);
    }
    console.log(`Fila insertada en ${SCHEMA}.usuarios (rol=super_admin).`);
  }

  console.log("\nListo. Podés iniciar sesión con:");
  console.log("  Email:   ", emailLc);
  console.log("  Password:", PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
