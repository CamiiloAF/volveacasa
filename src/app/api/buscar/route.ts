import { NextResponse } from 'next/server';
import { z } from 'zod';

import { aiEnabled, parseSearchQuery } from '@/lib/anthropic';
import { resolveCityQuery, searchPets } from '@/lib/pets';
import { normalize } from '@/lib/text';
import { COLORS, type Color, type SearchIntent } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  q: z.string().trim().min(2, 'Escribí algo más').max(300),
  cityCode: z.string().trim().nullable().optional(),
  status: z.enum(['activo', 'reunido']).default('activo'),
});

/**
 * Interpretación sin IA: separa el texto en palabras y reconoce los colores del
 * vocabulario. Es lo que corre si Claude no está disponible — peor que la IA,
 * pero muchísimo mejor que un buscador caído.
 */
function fallbackIntent(query: string): SearchIntent {
  const words = normalize(query).split(' ').filter((w) => w.length >= 3);
  const colors = words.filter((w): w is Color => (COLORS as readonly string[]).includes(w));
  const species = words.includes('perro') || words.includes('perra')
    ? 'perro'
    : words.includes('gato') || words.includes('gata')
      ? 'gato'
      : null;

  return {
    kind: null,
    species,
    colors,
    size: null,
    sex: null,
    city_query: null,
    keywords: words.filter((w) => !colors.includes(w as Color)).slice(0, 10),
  };
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Búsqueda inválida.' },
      { status: 400 },
    );
  }
  const { q, cityCode, status } = parsed.data;

  let intent: SearchIntent;
  let usedAi = false;

  if (aiEnabled()) {
    try {
      intent = await parseSearchQuery(q);
      usedAi = true;
    } catch (error) {
      console.error('parseSearchQuery falló:', error);
      intent = fallbackIntent(q);
    }
  } else {
    intent = fallbackIntent(q);
  }

  // La ciudad escogida en el selector manda sobre la que se adivinó del texto.
  if (cityCode) intent = { ...intent, city_query: null };

  try {
    const results = await searchPets(
      cityCode ? { ...intent, city_query: null } : intent,
      { status, limit: 48 },
    );

    const filtered = cityCode ? results.filter((p) => p.city_code === cityCode) : results;
    const resolved = resolveCityQuery(intent.city_query);

    return NextResponse.json({
      results: filtered,
      usedAi,
      intent: {
        ...intent,
        resolvedCityCode: cityCode ?? resolved.cityCode,
        resolvedDepartment: resolved.department,
      },
    });
  } catch (error) {
    console.error('searchPets falló:', error);
    return NextResponse.json(
      { error: 'No se pudo completar la búsqueda. Intentá de nuevo.' },
      { status: 500 },
    );
  }
}
