-- Logo de "Novo Outra Vez" en el ticket de las sucursales de Brasil.
--
-- El archivo vive en el repo (public/brand/) y no en la base: en la base va
-- solo la ruta. La version del ticket esta pasada a blanco y negro duro
-- porque la impresora termica es monocromo y los colores de la marca -- el
-- amarillo de "OUTRA" sobre todo -- salian casi en blanco.
--
-- Las sucursales de Paraguay no se tocan: siguen con el logo del emisor.
--
-- Idempotente.

UPDATE pronimerp.sucursales
   SET logo_url = '/brand/novo-outra-vez-ticket.png'
 WHERE moneda = 'BRL';

NOTIFY pgrst, 'reload schema';

-- ── Verificacion ─────────────────────────────────────────────────────────
SELECT nombre, moneda, nombre_comercial, logo_url
  FROM pronimerp.sucursales
 ORDER BY nombre;
