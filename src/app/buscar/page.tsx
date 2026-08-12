import type { Metadata } from 'next';

import { PetGrid } from '@/components/PetCard';
import { SearchForm } from '@/components/SearchForm';
import { aiEnabled, parseSearchQuery } from '@/lib/ai';
import { cityLabel } from '@/lib/cities';
import { filtersFromParams, hasAnyFilter, needsAi, type Filters } from '@/lib/filters';
import { browsePets, searchPets } from '@/lib/pets';
import { getCachedIntent, putCachedIntent } from '@/lib/search-cache';
import { normalize } from '@/lib/text';
import { COLORS, type Color, type PetCard as PetCardType, type SearchIntent } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Buscar una mascota',
  description:
    'Buscá mascotas perdidas y encontradas en Colombia. Filtrá por ciudad, especie, color y tamaño, o describila con tus palabras.',
};

export const dynamic = 'force-dynamic';

const EMPTY_INTENT: SearchIntent = {
  kind: null,
  species: null,
  colors: [],
  size: null,
  sex: null,
  city_query: null,
  keywords: [],
};

/**
 * Interpretación sin IA, para cuando no hay API key o el modelo falla: reconoce
 * los colores del vocabulario y la especie, y el resto lo deja como palabras
 * clave. Peor que la IA, muchísimo mejor que un buscador caído.
 */
function fallbackIntent(query: string): SearchIntent {
  const words = normalize(query).split(' ').filter((w) => w.length >= 3);
  const colors = words.filter((w): w is Color => (COLORS as readonly string[]).includes(w));
  const species = words.some((w) => w.startsWith('perr'))
    ? 'perro'
    : words.some((w) => w.startsWith('gat'))
      ? 'gato'
      : null;
  return {
    ...EMPTY_INTENT,
    species,
    colors,
    keywords: words.filter((w) => !colors.includes(w as Color)).slice(0, 10),
  };
}

/**
 * Convierte los filtros en una consulta.
 *
 * Solo se llama a la IA si la persona escribió texto libre. Filtrar por ciudad,
 * especie o color no gasta ni una petición del cupo: es una consulta a Postgres
 * y ya. Si algún día se agota la cuota, buscar sigue funcionando igual.
 */
async function runSearch(filters: Filters): Promise<{ results: PetCardType[]; usedAi: boolean }> {
  let intent = EMPTY_INTENT;
  let usedAi = false;

  if (needsAi(filters)) {
    const cached = await getCachedIntent(filters.q);
    if (cached) {
      intent = cached;
      usedAi = true;
    } else if (aiEnabled()) {
      try {
        intent = await parseSearchQuery(filters.q);
        usedAi = true;
        await putCachedIntent(filters.q, intent);
      } catch (error) {
        console.error('parseSearchQuery falló:', error);
        intent = fallbackIntent(filters.q);
      }
    } else {
      intent = fallbackIntent(filters.q);
    }
  }

  // Lo que la persona escogió a mano manda sobre lo que dedujo la IA: si tocó
  // "gato" en el filtro, el texto libre no debería cambiarlo a perro.
  const merged: SearchIntent = {
    kind: filters.kind ?? intent.kind,
    species: filters.species ?? intent.species,
    size: filters.size ?? intent.size,
    sex: filters.sex ?? intent.sex,
    colors: filters.colors.length ? filters.colors : intent.colors,
    city_query: filters.cityCode ? null : intent.city_query,
    keywords: filters.breed.trim()
      ? [...intent.keywords, normalize(filters.breed)].slice(0, 12)
      : intent.keywords,
  };

  // Cuando hay filtros escogidos a dedo pedimos más y recortamos abajo.
  const estricto = filters.colors.length > 0 || filters.breed.trim().length > 0;

  const results = await searchPets(merged, {
    status: filters.status,
    cityCode: filters.cityCode,
    limit: estricto ? 96 : 48,
  });

  return { results: applyStrictFilters(results, filters).slice(0, 48), usedAi };
}

/**
 * Un color o una raza que la persona tocó a mano sí excluye.
 *
 * En el SQL los colores solo puntúan, y para el texto libre eso es lo correcto:
 * dos personas describen distinto al mismo animal, y filtrar de más esconde
 * justo al que se busca. Pero cuando alguien marca el chip "Blanco" está
 * afirmando algo, y devolverle un perro café hace que deje de confiar en el
 * buscador — y quien desconfía se va.
 *
 * El tamaño y el sexo siguen sin excluir a propósito: "mediano" es opinión, y
 * el sexo casi nunca se sabe en un animal recogido en la calle.
 */
function applyStrictFilters(results: PetCardType[], filters: Filters): PetCardType[] {
  let filtered = results;

  if (filters.colors.length > 0) {
    filtered = filtered.filter((pet) =>
      filters.colors.some((color) => pet.colors.includes(color)),
    );
  }

  const breed = normalize(filters.breed);
  if (breed) {
    filtered = filtered.filter((pet) =>
      normalize(
        [pet.name, pet.breed_guess, pet.ai_summary, pet.description, pet.marks.join(' ')]
          .filter(Boolean)
          .join(' '),
      ).includes(breed),
    );
  }

  return filtered;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = filtersFromParams(await searchParams);
  const buscando = hasAnyFilter(filters);

  const [search, recent] = await Promise.all([
    buscando
      ? runSearch(filters).catch(() => ({ results: [], usedAi: false }))
      : Promise.resolve(null),
    buscando ? Promise.resolve([]) : browsePets({ limit: 12 }).catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Buscar una mascota</h1>
        <p className="text-ink-soft max-w-2xl">
          Filtrá por ciudad, especie y color, o describila con tus propias palabras. Lo que te
          quede más fácil.
        </p>
      </header>

      <SearchForm filters={filters} />

      {search && (
        <section className="flex flex-col gap-4">
          {search.results.length > 0 ? (
            <>
              <p className="text-sm text-ink-soft">
                {search.results.length === 1
                  ? '1 posible coincidencia'
                  : `${search.results.length} posibles coincidencias`}
                {filters.cityCode ? ` en ${cityLabel(filters.cityCode)}` : ''}, las más parecidas
                primero.
              </p>
              <PetGrid pets={search.results} />
            </>
          ) : (
            <div className="card p-8 text-center flex flex-col items-center gap-3">
              <span className="text-4xl" aria-hidden>
                🔎
              </span>
              <h2 className="font-bold text-lg">Todavía no hay nada que se parezca</h2>
              <p className="text-ink-soft max-w-md">
                Probá quitando algún filtro, o buscá en todo el país en vez de en una sola ciudad.
                Y si no aparece, publicá el aviso: quien lo encuentre va a poder dar contigo.
              </p>
              <a
                href="/publicar"
                className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-ink font-bold"
              >
                Publicar un aviso
              </a>
            </div>
          )}
        </section>
      )}

      {!buscando && recent.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Últimos avisos publicados</h2>
          <PetGrid pets={recent} />
        </section>
      )}
    </div>
  );
}
