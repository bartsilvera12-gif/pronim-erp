import QRCode from "qrcode";

/**
 * QR que se imprime al pie de la factura.
 *
 * Apunta a un acortador de terceros (qrcreator.dev) con un id opaco, no al
 * destino final. Eso tiene una consecuencia que conviene tener presente: si
 * ese servicio cae o la cuenta vence, el QR de TODAS las facturas ya
 * entregadas deja de funcionar, y el papel no se puede corregir. Cambiar la
 * constante solo arregla los comprobantes nuevos.
 */
export const QR_COMPROBANTE_URL = "https://www.qrcreator.dev/qr/146B663D";

/**
 * Devuelve el QR como PNG en data URI para incrustarlo en el HTML que se
 * manda a la impresora. Se genera desde el texto en vez de usar una imagen
 * fija para que salga nítido al tamaño que se imprima: la térmica es de
 * puntos y un PNG reescalado deja los módulos borrosos.
 */
export async function qrComprobanteDataUri(
  texto: string = QR_COMPROBANTE_URL,
): Promise<string | null> {
  const t = (texto ?? "").trim();
  if (!t) return null;
  try {
    return await QRCode.toDataURL(t, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    // Un QR que no se pudo generar no puede impedir imprimir la factura.
    return null;
  }
}
