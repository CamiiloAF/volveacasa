import { NextResponse } from 'next/server';

import { aiEnabled, parseSearchQuery } from '@/lib/ai';
import { siteUrl, siteUrlIsFallback } from '@/lib/site';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Check = { nombre: string; ok: boolean; detalle: string };

/**
 * Chequeo de salud para usar después de desplegar. Verifica lo que suele
 * quedar a medias: variables de entorno, migraciones corridas y llave de Gemini
 * viva. Devuelve 503 si algo falla, para poder engancharlo a un monitor.
 */
export async function GET(request: Request) {
  const checks: Check[] = [];

  // Comparamos la variable contra el dominio por el que realmente llegó esta
  // petición. Es el chequeo que atrapa el error más caro de todos: si apuntan a
  // distinto sitio, compartir un aviso por WhatsApp no muestra la foto y el
  // link lleva a otro lado — y nada más en la app se ve roto, así que sin este
  // aviso el problema pasa desapercibido.
  const configured = siteUrl();
  const realHost =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';

  if (siteUrlIsFallback()) {
    checks.push({
      nombre: 'NEXT_PUBLIC_SITE_URL',
      ok: false,
      detalle:
        'Sin configurar (o mal escrita). Las previsualizaciones de WhatsApp van a apuntar a localhost.',
    });
  } else {
    const configuredHost = new URL(configured).host;
    const matches = !realHost || configuredHost === realHost;
    checks.push({
      nombre: 'NEXT_PUBLIC_SITE_URL',
      ok: matches,
      detalle: matches
        ? configured
        : `Apunta a "${configuredHost}" pero este sitio responde en "${realHost}". ` +
          `Compartir un aviso no va a mostrar la foto. Corregila a https://${realHost} y volvé a desplegar.`,
    });
  }

  // --- Base de datos ------------------------------------------------------
  try {
    const supabase = adminClient();
    const { error } = await supabase.from('pets').select('id').limit(1);
    checks.push({
      nombre: 'Tabla pets',
      ok: !error,
      detalle: error ? error.message : 'La tabla responde.',
    });

    const { error: rpcError } = await supabase.rpc('search_pets', { p_limit: 1 });
    checks.push({
      nombre: 'Función search_pets',
      ok: !rpcError,
      detalle: rpcError ? rpcError.message : 'La búsqueda responde.',
    });

    const { error: bucketError } = await supabase.storage.from('fotos').list('', { limit: 1 });
    checks.push({
      nombre: 'Bucket fotos',
      ok: !bucketError,
      detalle: bucketError ? bucketError.message : 'El bucket existe.',
    });
  } catch (error) {
    checks.push({
      nombre: 'Conexión a Supabase',
      ok: false,
      detalle: error instanceof Error ? error.message : 'Error desconocido.',
    });
  }

  // --- Claude -------------------------------------------------------------
  if (!aiEnabled()) {
    checks.push({
      nombre: 'Gemini',
      ok: false,
      detalle: 'Sin GEMINI_API_KEY. La app funciona, pero sin IA en publicar ni buscar.',
    });
  } else {
    try {
      const intent = await parseSearchQuery('gato negro con mancha blanca en Medellín');
      const acierta =
        intent.species === 'gato' &&
        intent.colors.includes('negro') &&
        Boolean(intent.city_query);
      checks.push({
        nombre: 'Gemini',
        ok: acierta,
        detalle: acierta
          ? 'Interpretó bien la búsqueda de prueba.'
          : `Respondió, pero raro: ${JSON.stringify(intent)}`,
      });
    } catch (error) {
      checks.push({
        nombre: 'Gemini',
        ok: false,
        detalle: error instanceof Error ? error.message : 'Error desconocido.',
      });
    }
  }

  const todoBien = checks.every((check) => check.ok);
  return NextResponse.json({ ok: todoBien, checks }, { status: todoBien ? 200 : 503 });
}
