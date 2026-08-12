import { NextResponse } from 'next/server';

import { aiEnabled, parseSearchQuery } from '@/lib/anthropic';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Check = { nombre: string; ok: boolean; detalle: string };

/**
 * Chequeo de salud para usar después de desplegar. Verifica lo que suele
 * quedar a medias: variables de entorno, migración corrida y llave de Claude
 * viva. Devuelve 503 si algo falla, para poder engancharlo a un monitor.
 */
export async function GET() {
  const checks: Check[] = [];

  checks.push({
    nombre: 'NEXT_PUBLIC_SITE_URL',
    ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    detalle: process.env.NEXT_PUBLIC_SITE_URL
      ? process.env.NEXT_PUBLIC_SITE_URL
      : 'Sin esta variable, las previsualizaciones de WhatsApp apuntan a localhost.',
  });

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
      nombre: 'Claude',
      ok: false,
      detalle: 'Sin ANTHROPIC_API_KEY. La app funciona, pero sin IA en publicar ni buscar.',
    });
  } else {
    try {
      const intent = await parseSearchQuery('gato negro con mancha blanca en Medellín');
      const acierta =
        intent.species === 'gato' &&
        intent.colors.includes('negro') &&
        Boolean(intent.city_query);
      checks.push({
        nombre: 'Claude',
        ok: acierta,
        detalle: acierta
          ? 'Interpretó bien la búsqueda de prueba.'
          : `Respondió, pero raro: ${JSON.stringify(intent)}`,
      });
    } catch (error) {
      checks.push({
        nombre: 'Claude',
        ok: false,
        detalle: error instanceof Error ? error.message : 'Error desconocido.',
      });
    }
  }

  const todoBien = checks.every((check) => check.ok);
  return NextResponse.json({ ok: todoBien, checks }, { status: todoBien ? 200 : 503 });
}
