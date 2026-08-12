import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PetGrid } from '@/components/PetCard';
import { SearchExperience } from '@/components/SearchExperience';
import { aiEnabled, parseSearchQuery } from '@/lib/ai';
import { browsePets, resolveCityQuery, searchPets } from '@/lib/pets';
import { getCachedIntent, putCachedIntent } from '@/lib/search-cache';
import type { PetCard as PetCardType } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Buscar una mascota',
  description:
    'Describí al animalito con tus propias palabras y encontrá avisos que se le parezcan en toda Colombia.',
};

export const dynamic = 'force-dynamic';

/**
 * Si la búsqueda viene en la URL (un link que alguien compartió), la resolvemos
 * acá en el servidor: quien abre el link ve los resultados en el HTML, sin
 * pantalla de carga y aunque el JavaScript tarde en llegar.
 */
async function resolveInitial(query: string, cityCode: string | null) {
  if (query.trim().length < 2) return { results: null, intent: null };

  try {
    const cached = await getCachedIntent(query);
    const intent = cached
      ? cached
      : aiEnabled()
      ? await parseSearchQuery(query).then(async (parsed) => {
          await putCachedIntent(query, parsed);
          return parsed;
        })
      : {
          kind: null,
          species: null,
          colors: [],
          size: null,
          sex: null,
          city_query: null,
          keywords: query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3).slice(0, 10),
        };

    const effective = cityCode ? { ...intent, city_query: null } : intent;
    const found = await searchPets(effective, { limit: 48 });
    const results = cityCode ? found.filter((p) => p.city_code === cityCode) : found;
    const resolved = resolveCityQuery(intent.city_query);

    return {
      results: results as PetCardType[],
      intent: {
        species: intent.species,
        colors: intent.colors as string[],
        size: intent.size,
        keywords: intent.keywords,
        resolvedCityCode: cityCode ?? resolved.cityCode,
        resolvedDepartment: resolved.department,
      },
    };
  } catch {
    // Que el buscador se vea igual: el cliente puede reintentar solo.
    return { results: null, intent: null };
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ciudad?: string }>;
}) {
  const { q = '', ciudad = '' } = await searchParams;

  const [initial, recent] = await Promise.all([
    resolveInitial(q, ciudad || null),
    q ? Promise.resolve([]) : browsePets({ limit: 12 }).catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Buscar una mascota</h1>
        <p className="text-ink-soft max-w-2xl">
          Escribilo como lo recordás, sin preocuparte por la redacción. Entendemos colores, tamaño,
          raza, señas particulares y ciudad.
        </p>
      </header>

      <Suspense fallback={<div className="card h-40 animate-pulse" />}>
        <SearchExperience
          initialQuery={q}
          initialResults={initial.results}
          initialIntent={initial.intent}
        />
      </Suspense>

      {!q && recent.length > 0 && (
        <section className="flex flex-col gap-4 pt-2">
          <h2 className="text-lg font-bold">Últimos avisos publicados</h2>
          <PetGrid pets={recent} />
        </section>
      )}
    </div>
  );
}
