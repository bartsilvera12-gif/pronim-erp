-- =====================================================================
-- Pronim Consultoría — Fix GRANTs a authenticated en schema pronimerp
-- ---------------------------------------------------------------------
-- Sintoma: al editar un producto (super_admin) desde /inventario/[id]/editar,
-- PostgREST devuelve 403 "permission denied for table productos".
--
-- Causa: el schema `pronimerp` no fue clonado usando la función
-- neura_clone (que grantea CRUD a authenticated). Alguna tabla quedo
-- con solo SELECT, y las escrituras via JWT explotan.
--
-- Fix: re-otorgar SELECT/INSERT/UPDATE/DELETE en TODAS las tablas del
-- schema pronimerp a authenticated + USAGE en secuencias + default
-- privileges para que nuevas tablas del schema hereden. RLS sigue
-- filtrando por empresa via puede_acceder_empresa(); acá solo se
-- corrigen los grants base (RLS no tapa un permission-denied de tabla).
--
-- Idempotente: los GRANTs son no-op si ya existen.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'pronimerp') THEN
    RAISE NOTICE 'Schema pronimerp no existe, se omite.';
    RETURN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA pronimerp TO postgres, anon, authenticated, service_role';

  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pronimerp TO authenticated';
  EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA pronimerp TO postgres, service_role';

  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pronimerp TO authenticated';
  EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA pronimerp TO postgres, service_role';

  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pronimerp GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pronimerp GRANT ALL ON TABLES TO postgres, service_role';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pronimerp GRANT USAGE, SELECT ON SEQUENCES TO authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pronimerp GRANT ALL ON SEQUENCES TO postgres, service_role';
END $$;

-- Refrescar cache de PostgREST (best-effort; falla silenciosa si el channel
-- no existe en la instancia local).
DO $$
BEGIN
  BEGIN
    PERFORM pg_notify('pgrst', 'reload schema');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

COMMIT;
