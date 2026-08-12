const FALLBACK = 'http://localhost:3000';

/**
 * URL pública del sitio, siempre válida.
 *
 * Antes esto era `new URL(process.env.NEXT_PUBLIC_SITE_URL)` directo en el
 * layout, y una variable sin `https://` tumbaba el despliegue entero con un
 * error que apuntaba a `/_not-found` — a kilómetros de la causa real. Escribir
 * el dominio sin el esquema es el error más fácil de cometer al configurar
 * Vercel, así que lo corregimos en vez de estallar.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK;

  // "volveacasa.vercel.app" -> "https://volveacasa.vercel.app"
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withScheme);
    // Sin barra al final: se la agrega quien construya cada ruta.
    return url.origin;
  } catch {
    console.warn(
      `[volveacasa] NEXT_PUBLIC_SITE_URL no es una URL válida: ${JSON.stringify(raw)}. ` +
        `Usando ${FALLBACK}. Las previsualizaciones de WhatsApp no van a funcionar hasta corregirla.`,
    );
    return FALLBACK;
  }
}

/** La misma URL como objeto, para `metadataBase`. */
export function siteUrlObject(): URL {
  return new URL(siteUrl());
}

/** True si la variable quedó sin configurar y estamos en el fallback. */
export function siteUrlIsFallback(): boolean {
  return siteUrl() === FALLBACK;
}
