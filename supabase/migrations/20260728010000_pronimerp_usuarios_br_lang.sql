-- Setea lang='pt-BR' para todos los usuarios cuya sucursal es de Brasil.
-- El frontend usa usuarios.lang para elegir diccionario y formato de fecha
-- (ver src/lib/i18n). Sin esto, los operadores de Betim/BH/El Dorado ven
-- el ERP en español aunque su moneda ya se muestre en R$.
-- Idempotente: solo actualiza filas que aun no estan en 'pt-BR'.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp' AND table_name = 'usuarios' AND column_name = 'lang'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp' AND table_name = 'usuarios' AND column_name = 'sucursal_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pronimerp' AND table_name = 'sucursales' AND column_name = 'moneda'
  ) THEN
    UPDATE pronimerp.usuarios u
       SET lang = 'pt-BR'
      FROM pronimerp.sucursales s
     WHERE u.sucursal_id = s.id
       AND s.moneda = 'BRL'
       AND u.lang <> 'pt-BR';
  END IF;
END $$;
