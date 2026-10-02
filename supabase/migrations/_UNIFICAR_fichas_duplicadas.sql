-- ============================================================================
--  UNIFICA LAS FICHAS QUE SON LA MISMA PERSONA ESCRITA DE DOS FORMAS
--
--  ⚠️  MODIFICA DATOS. BACKUP ANTES.
--
--  Son 17 pares verificados a mano, de la caja A del diagnóstico. En cada uno
--  se queda la ficha que tiene el crédito y se le pasa todo el historial de
--  la otra: ventas, recepciones, movimientos de crédito, eventos, cuentas por
--  cobrar — cualquier tabla que apunte al cliente. La ficha vacía queda dada
--  de baja (deleted_at), no se borra: el historial sigue siendo auditable.
--
--  QUEDARON AFUERA A PROPÓSITO
--    · Jimena Ferreira / Mirna Ferreira   → Jimena no es Mirna
--    · Karen Mora / Karen Jara            → Mora no es Jara
--      El algoritmo las dio por gemelas porque se diferencian en pocas letras.
--      Si vos confirmás que son la misma persona, las agrego.
--    · Toda la caja C (mismo teléfono, otro nombre): son familiares o gente
--      que comparte un número. Unirlas sería mezclar dos clientas reales.
--
--  OJO CON ALE: son TRES fichas — "Ale (Bru)", "Ale Bru" y "Ale(Bru)".
--  Las dos primeras se vuelcan en la tercera, que es la que tiene +331.000.
--
--  Antes de tocar nada verifica que las dos fichas de cada par pertenezcan a
--  la misma cartera (scope_clientes). Si alguna no coincide, aborta todo: no
--  se puede mover un cliente de una cartera a otra sin romper el aislamiento
--  entre sucursales.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  VERIFICACIÓN (solo lee) — mirá esto antes de ejecutar
-- ─────────────────────────────────────────────────────────────────────────
WITH pares(se_va, queda) AS (VALUES
  ('019ca69d-bc4e-4f80-a001-33b4cb878d7e'::uuid, 'a0dc44b0-681e-49d9-8492-a00e7b3d44ed'::uuid), -- Michaal → Michal Baten
  ('05bccbcf-75a0-43d5-8835-8b7b5c0db7e5',       'bf0cd9df-c790-46a0-8ddc-463e4a75aeb9'),       -- Jemima Canhete → Jhemima Canete
  ('5ba888ec-dfa5-40b8-81aa-ebce02bee375',       'f5000b48-0cf7-47c7-b36a-40a0abbd9075'),       -- Ale (Bru) → Ale(Bru)
  ('9f51298c-9891-4c34-9b8c-b061e35a8d83',       'f5000b48-0cf7-47c7-b36a-40a0abbd9075'),       -- Ale Bru → Ale(Bru)
  ('16659b1f-6e42-46ab-b3f4-0bdfb136919c',       'eb9d986b-aced-428a-948e-5ba239a415cb'),       -- Deisy → Deysi Romero
  ('a19f0872-d45e-43c4-9cdb-0fdc5c1d8262',       'af9ac7e3-c59b-49eb-8975-2929e00e859d'),       -- Larissa → Larisa Pohl
  ('def4e428-600b-4b6c-aff6-5acf3f926f76',       '7e66ab14-e01a-467b-a825-d8f8d7c5806c'),       -- Alissar → Alisar Zein
  ('7f856c9b-d513-4847-8f7f-d4fa6e90ce9b',       '420e4dbf-d588-4ea3-aebb-5888e1be2b3e'),       -- Baldoza → Barboza
  ('4745864e-8042-42f6-89b0-9196e4ef361e',       'bd2e6205-3c2d-431d-a466-96ab73094786'),       -- Rufinelle → Rufinelle+
  ('bdd46ecd-a9f1-4d4c-a2c4-adb7acadc601',       '0ec22386-d52b-457c-a714-288ac6ac9ce0'),       -- Albertini → Albertin
  ('629a4ba4-887f-46e8-8d6a-fbfc9d299e77',       '36ab7447-93e5-4003-aee7-ffd0a61ed995'),       -- Valvidia → Valdivia
  ('2a631751-31eb-411d-91e1-5bc21d58a717',       'a4bfb3f4-620f-416a-aa1e-9eb0c8d09aa3'),       -- Xoana → Xioana Gomez
  ('182bed0b-6d54-469b-a760-c8cfc10f59d0',       'd7d0c4aa-13da-4e00-b860-f0a1c0c0cdc5'),       -- Evelin → Evelyn Gimenez
  ('2413c2b0-2737-45dc-aaa2-e7fddf140748',       'a1bd9d1a-487e-40eb-8de8-fa9ef1ba599b'),       -- Ullon → Uyon
  ('14e6a729-a21b-435f-a38f-8e78cef294ec',       '49390878-c6de-423b-a8c0-227b5c8df8b0'),       -- Mayra → Maira Capdevila
  ('333d725a-62d2-4b0c-b2b7-36a1b9b06947',       'af6f822e-cc41-4428-a9e3-dc7ec6c892d7'),       -- Naara → Nahara Feris
  ('7e01002d-4581-44ae-8ccf-7d2e50266743',       'c53d26ab-4d55-494c-a214-b8056dd81d6a')        -- Barreta → Barreto
),
saldo AS (
  SELECT c.id,
         COALESCE(c.nombre_contacto, c.nombre, '?') AS nombre,
         c.scope_clientes,
         COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END), 0) AS saldo
    FROM pronimerp.clientes c
    LEFT JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
   GROUP BY c.id, c.nombre_contacto, c.nombre, c.scope_clientes
)
SELECT v.nombre AS se_da_de_baja, v.saldo AS saldo_que_aporta,
       q.nombre AS se_queda,      q.saldo AS saldo_actual,
       v.saldo + q.saldo          AS saldo_final,
       CASE WHEN v.scope_clientes IS DISTINCT FROM q.scope_clientes
            THEN '⚠ CARTERAS DISTINTAS' ELSE 'ok' END AS cartera
  FROM pares p
  JOIN saldo v ON v.id = p.se_va
  JOIN saldo q ON q.id = p.queda
 ORDER BY v.saldo;


-- ─────────────────────────────────────────────────────────────────────────
--  EJECUCIÓN
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _pares (se_va uuid, queda uuid) ON COMMIT DROP;
INSERT INTO _pares VALUES
  ('019ca69d-bc4e-4f80-a001-33b4cb878d7e', 'a0dc44b0-681e-49d9-8492-a00e7b3d44ed'),
  ('05bccbcf-75a0-43d5-8835-8b7b5c0db7e5', 'bf0cd9df-c790-46a0-8ddc-463e4a75aeb9'),
  ('5ba888ec-dfa5-40b8-81aa-ebce02bee375', 'f5000b48-0cf7-47c7-b36a-40a0abbd9075'),
  ('9f51298c-9891-4c34-9b8c-b061e35a8d83', 'f5000b48-0cf7-47c7-b36a-40a0abbd9075'),
  ('16659b1f-6e42-46ab-b3f4-0bdfb136919c', 'eb9d986b-aced-428a-948e-5ba239a415cb'),
  ('a19f0872-d45e-43c4-9cdb-0fdc5c1d8262', 'af9ac7e3-c59b-49eb-8975-2929e00e859d'),
  ('def4e428-600b-4b6c-aff6-5acf3f926f76', '7e66ab14-e01a-467b-a825-d8f8d7c5806c'),
  ('7f856c9b-d513-4847-8f7f-d4fa6e90ce9b', '420e4dbf-d588-4ea3-aebb-5888e1be2b3e'),
  ('4745864e-8042-42f6-89b0-9196e4ef361e', 'bd2e6205-3c2d-431d-a466-96ab73094786'),
  ('bdd46ecd-a9f1-4d4c-a2c4-adb7acadc601', '0ec22386-d52b-457c-a714-288ac6ac9ce0'),
  ('629a4ba4-887f-46e8-8d6a-fbfc9d299e77', '36ab7447-93e5-4003-aee7-ffd0a61ed995'),
  ('2a631751-31eb-411d-91e1-5bc21d58a717', 'a4bfb3f4-620f-416a-aa1e-9eb0c8d09aa3'),
  ('182bed0b-6d54-469b-a760-c8cfc10f59d0', 'd7d0c4aa-13da-4e00-b860-f0a1c0c0cdc5'),
  ('2413c2b0-2737-45dc-aaa2-e7fddf140748', 'a1bd9d1a-487e-40eb-8de8-fa9ef1ba599b'),
  ('14e6a729-a21b-435f-a38f-8e78cef294ec', '49390878-c6de-423b-a8c0-227b5c8df8b0'),
  ('333d725a-62d2-4b0c-b2b7-36a1b9b06947', 'af6f822e-cc41-4428-a9e3-dc7ec6c892d7'),
  ('7e01002d-4581-44ae-8ccf-7d2e50266743', 'c53d26ab-4d55-494c-a214-b8056dd81d6a');

DO $$
DECLARE
  p   RECORD;
  t   RECORD;
  mal int;
BEGIN
  -- Freno de mano: ninguna ficha puede cambiar de cartera al unirse.
  SELECT count(*) INTO mal
    FROM _pares pr
    JOIN pronimerp.clientes a ON a.id = pr.se_va
    JOIN pronimerp.clientes b ON b.id = pr.queda
   WHERE a.scope_clientes IS DISTINCT FROM b.scope_clientes;
  IF mal > 0 THEN
    RAISE EXCEPTION 'Hay % par(es) con carteras distintas. No se unifica nada.', mal;
  END IF;

  -- Que los 34 ids existan y estén vivos.
  SELECT count(*) INTO mal
    FROM (SELECT se_va AS id FROM _pares UNION SELECT queda FROM _pares) x
   WHERE NOT EXISTS (SELECT 1 FROM pronimerp.clientes c
                      WHERE c.id = x.id AND c.deleted_at IS NULL);
  IF mal > 0 THEN
    RAISE EXCEPTION '% ficha(s) no existen o ya están dadas de baja.', mal;
  END IF;

  -- Mueve el historial. Recorre TODA tabla con una columna cliente_id, así
  -- no queda nada atrás aunque después se agreguen módulos nuevos.
  FOR p IN SELECT * FROM _pares LOOP
    FOR t IN
      SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables tb
          ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
       WHERE c.table_schema = 'pronimerp'
         AND c.column_name  = 'cliente_id'
         AND tb.table_type  = 'BASE TABLE'
    LOOP
      EXECUTE format('UPDATE pronimerp.%I SET cliente_id = $1 WHERE cliente_id = $2',
                     t.table_name)
        USING p.queda, p.se_va;
    END LOOP;

    -- Completa los datos de contacto que le falten a la ficha que se queda.
    UPDATE pronimerp.clientes q
       SET telefono = COALESCE(NULLIF(trim(q.telefono), ''), v.telefono),
           ruc      = COALESCE(NULLIF(trim(q.ruc), ''),      v.ruc),
           email    = COALESCE(NULLIF(trim(q.email), ''),    v.email)
      FROM pronimerp.clientes v
     WHERE q.id = p.queda AND v.id = p.se_va;

    -- Deja constancia en la bitácora de la ficha que se queda: de dónde vino
    -- el historial. Así la unificación es rastreable desde la pantalla.
    INSERT INTO pronimerp.cliente_eventos
           (empresa_id, cliente_id, tipo, titulo, descripcion, fecha)
    SELECT q.empresa_id, q.id, 'otro',
           'Fichas unificadas',
           'Se absorbió la ficha duplicada "' ||
             COALESCE(v.nombre_contacto, v.nombre, v.id::text) ||
             '" (' || v.id::text || '). Corrección de la importación del 01/10/2026.',
           now()
      FROM pronimerp.clientes q, pronimerp.clientes v
     WHERE q.id = p.queda AND v.id = p.se_va;

    -- Baja lógica de la ficha vacía. No se borra: el id sigue existiendo.
    UPDATE pronimerp.clientes
       SET deleted_at = now()
     WHERE id = p.se_va;
  END LOOP;
END $$;

-- Rehace el enlace FIFO: ahora que el historial está junto, salidas que antes
-- no tenían lote pueden encontrarlo. Solo toca las que siguen sin asignar.
DO $$
DECLARE
  r_salida  RECORD;
  r_entrada RECORD;
  restante  numeric;
  aplicar   numeric;
BEGIN
  FOR r_salida IN
    SELECT s.id, s.empresa_id, s.cliente_id, s.monto, s.fecha
      FROM pronimerp.cliente_creditos_movimientos s
     WHERE s.tipo = 'SALIDA'
       AND NOT EXISTS (SELECT 1 FROM pronimerp.cliente_creditos_consumos c
                        WHERE c.salida_id = s.id)
     ORDER BY s.cliente_id, s.fecha ASC, s.created_at ASC
  LOOP
    restante := r_salida.monto;
    FOR r_entrada IN
      SELECT e.id,
             e.monto - COALESCE((SELECT SUM(c.monto_aplicado)
                                   FROM pronimerp.cliente_creditos_consumos c
                                  WHERE c.entrada_id = e.id), 0) AS saldo
        FROM pronimerp.cliente_creditos_movimientos e
       WHERE e.cliente_id = r_salida.cliente_id
         AND e.empresa_id = r_salida.empresa_id
         AND e.tipo IN ('ENTRADA','AJUSTE')
         AND e.fecha <= r_salida.fecha
       ORDER BY e.fecha ASC, e.created_at ASC
    LOOP
      EXIT WHEN restante <= 0;
      CONTINUE WHEN r_entrada.saldo <= 0;
      aplicar := LEAST(r_entrada.saldo, restante);
      INSERT INTO pronimerp.cliente_creditos_consumos
             (empresa_id, entrada_id, salida_id, monto_aplicado)
      VALUES (r_salida.empresa_id, r_entrada.id, r_salida.id, aplicar);
      restante := restante - aplicar;
    END LOOP;
  END LOOP;
END $$;

COMMIT;


-- ============================================================================
--  CONTROLES
-- ============================================================================

-- Las 17 fichas vacías tienen que estar de baja y sin historial colgando.
SELECT c.nombre_contacto, c.deleted_at IS NOT NULL AS dada_de_baja,
       (SELECT count(*) FROM pronimerp.cliente_creditos_movimientos m
         WHERE m.cliente_id = c.id) AS movimientos_que_quedaron
  FROM pronimerp.clientes c
 WHERE c.id IN ('019ca69d-bc4e-4f80-a001-33b4cb878d7e','05bccbcf-75a0-43d5-8835-8b7b5c0db7e5',
                '5ba888ec-dfa5-40b8-81aa-ebce02bee375','9f51298c-9891-4c34-9b8c-b061e35a8d83',
                '16659b1f-6e42-46ab-b3f4-0bdfb136919c','a19f0872-d45e-43c4-9cdb-0fdc5c1d8262',
                'def4e428-600b-4b6c-aff6-5acf3f926f76','7f856c9b-d513-4847-8f7f-d4fa6e90ce9b',
                '4745864e-8042-42f6-89b0-9196e4ef361e','bdd46ecd-a9f1-4d4c-a2c4-adb7acadc601',
                '629a4ba4-887f-46e8-8d6a-fbfc9d299e77','2a631751-31eb-411d-91e1-5bc21d58a717',
                '182bed0b-6d54-469b-a760-c8cfc10f59d0','2413c2b0-2737-45dc-aaa2-e7fddf140748',
                '14e6a729-a21b-435f-a38f-8e78cef294ec','333d725a-62d2-4b0c-b2b7-36a1b9b06947',
                '7e01002d-4581-44ae-8ccf-7d2e50266743');

-- Cuántos negativos quedan y cuánto suman. Esperado: ~200 clientes y una
-- cifra en torno a −27.000.000. La unificación recupera poco: el agujero
-- grande no era de fichas partidas.
SELECT count(*) AS clientes_negativos, SUM(saldo) AS suma
  FROM (SELECT c.id,
               SUM(CASE WHEN m.tipo IN ('ENTRADA','AJUSTE') THEN m.monto ELSE -m.monto END) AS saldo
          FROM pronimerp.clientes c
          JOIN pronimerp.cliente_creditos_movimientos m ON m.cliente_id = c.id
         WHERE c.deleted_at IS NULL
         GROUP BY c.id) x
 WHERE saldo < 0;

-- Ningún lote consumido de más.
SELECT count(*) AS lotes_sobreconsumidos
  FROM (SELECT e.id, e.monto - COALESCE(SUM(c.monto_aplicado),0) AS saldo
          FROM pronimerp.cliente_creditos_movimientos e
          LEFT JOIN pronimerp.cliente_creditos_consumos c ON c.entrada_id = e.id
         WHERE e.tipo IN ('ENTRADA','AJUSTE')
         GROUP BY e.id, e.monto) z
 WHERE saldo < 0;
