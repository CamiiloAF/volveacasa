import { COLORS, KINDS, SEXES, SIZES, SPECIES, type Color, type Kind, type Sex, type Size, type Species } from './types';

/**
 * Filtros que la persona escoge a mano, sin IA.
 *
 * Existen por dos razones. La primera es que mucha gente prefiere tocar
 * opciones antes que redactar, sobre todo desde el celular y con afán. La
 * segunda es que no gastan ni una petición del cupo: si un día se agota la
 * cuota de IA, buscar por ciudad y especie sigue funcionando igual.
 */
export type Filters = {
  /** Texto libre. Si viene, lo interpreta la IA y se suma a los filtros. */
  q: string;
  kind: Kind | null;
  species: Species | null;
  cityCode: string | null;
  size: Size | null;
  sex: Sex | null;
  colors: Color[];
  /** Raza, barrio o cualquier palabra: se busca dentro del texto del aviso. */
  breed: string;
  status: 'activo' | 'reunido';
};

export const EMPTY_FILTERS: Filters = {
  q: '',
  kind: null,
  species: null,
  cityCode: null,
  size: null,
  sex: null,
  colors: [],
  breed: '',
  status: 'activo',
};

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Lee los filtros de la URL. Las URLs se comparten, así que son la fuente de verdad. */
export function filtersFromParams(params: Record<string, string | string[] | undefined>): Filters {
  const one = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const colors = (one('color') ?? '')
    .split(',')
    .map((c) => pick<Color>(c.trim(), COLORS))
    .filter((c): c is Color => c !== null)
    .slice(0, 4);

  return {
    q: (one('q') ?? '').slice(0, 300),
    kind: pick<Kind>(one('tipo'), KINDS),
    species: pick<Species>(one('especie'), SPECIES),
    cityCode: one('ciudad')?.trim() || null,
    size: pick<Size>(one('tamano'), SIZES),
    sex: pick<Sex>(one('sexo'), SEXES),
    colors,
    breed: (one('raza') ?? '').slice(0, 60),
    status: one('estado') === 'reunido' ? 'reunido' : 'activo',
  };
}

/** Arma la URL. Solo escribe lo que está puesto, para que se lea fácil al compartirla. */
export function filtersToQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.kind) params.set('tipo', filters.kind);
  if (filters.species) params.set('especie', filters.species);
  if (filters.cityCode) params.set('ciudad', filters.cityCode);
  if (filters.size) params.set('tamano', filters.size);
  if (filters.sex && filters.sex !== 'desconocido') params.set('sexo', filters.sex);
  if (filters.colors.length) params.set('color', filters.colors.join(','));
  if (filters.breed.trim()) params.set('raza', filters.breed.trim());
  if (filters.status !== 'activo') params.set('estado', filters.status);
  return params.toString();
}

/** ¿Hay algo por lo que filtrar? Sirve para decidir si mostramos resultados o lo último publicado. */
export function hasAnyFilter(filters: Filters): boolean {
  return Boolean(
    filters.q.trim() ||
      filters.kind ||
      filters.species ||
      filters.cityCode ||
      filters.size ||
      (filters.sex && filters.sex !== 'desconocido') ||
      filters.colors.length ||
      filters.breed.trim(),
  );
}

/** ¿Necesitamos la IA? Solo si escribió texto libre. Los filtros solos no la usan. */
export function needsAi(filters: Filters): boolean {
  return filters.q.trim().length >= 2;
}
