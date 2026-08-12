import 'server-only';

import { adminClient } from './supabase';
import { CITIES, normalize as normalizeCity } from './cities';
import type { Kind, Pet, PetCard, SearchIntent, Species } from './types';

/** Columnas seguras para listados: sin contacto y sin el hash del código de gestión. */
const CARD_COLUMNS = `
  id, slug, kind, species, status, name, description, colors, size, sex, coat,
  marks, has_collar, breed_guess, ai_summary, city_code, city_name, department,
  neighborhood, event_date, photos, reward, created_at
`;

export type BrowseFilters = {
  kind?: Kind | null;
  species?: Species | null;
  cityCode?: string | null;
  department?: string | null;
  status?: 'activo' | 'reunido';
  limit?: number;
  offset?: number;
};

/** Listado simple, sin IA: lo que se ve al entrar y al filtrar con los selectores. */
export async function browsePets(filters: BrowseFilters = {}): Promise<PetCard[]> {
  const supabase = adminClient();
  let query = supabase
    .from('pets')
    .select(CARD_COLUMNS)
    .eq('status', filters.status ?? 'activo')
    .order('created_at', { ascending: false })
    .range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 24) - 1);

  if (filters.kind) query = query.eq('kind', filters.kind);
  if (filters.species) query = query.eq('species', filters.species);
  if (filters.cityCode) query = query.eq('city_code', filters.cityCode);
  if (filters.department) query = query.eq('department', filters.department);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudo cargar el listado: ${error.message}`);
  return (data ?? []) as unknown as PetCard[];
}

/**
 * Resuelve el municipio que la persona escribió en la búsqueda. Devuelve el
 * código DANE solo si hay una coincidencia clara; ante la duda no filtra, para
 * no esconder resultados de un municipio vecino.
 */
export function resolveCityQuery(cityQuery: string | null): {
  cityCode: string | null;
  department: string | null;
} {
  if (!cityQuery) return { cityCode: null, department: null };
  const q = normalizeCity(cityQuery);
  if (q.length < 3) return { cityCode: null, department: null };

  const exact = CITIES.filter((c) => normalizeCity(c.n) === q);
  if (exact.length === 1) return { cityCode: exact[0].c, department: null };
  // Varios municipios con el mismo nombre en departamentos distintos: no
  // filtramos por código, pero tampoco descartamos la pista.
  if (exact.length > 1) return { cityCode: null, department: null };

  const dept = CITIES.find((c) => normalizeCity(c.d) === q);
  if (dept) return { cityCode: null, department: dept.d };

  const partial = CITIES.filter((c) => normalizeCity(c.n).startsWith(q));
  if (partial.length === 1) return { cityCode: partial[0].c, department: null };

  return { cityCode: null, department: null };
}

/** Búsqueda con los filtros que la IA sacó del texto libre. */
export async function searchPets(
  intent: SearchIntent,
  options: { status?: 'activo' | 'reunido'; limit?: number; offset?: number } = {},
): Promise<PetCard[]> {
  const supabase = adminClient();
  const { cityCode, department } = resolveCityQuery(intent.city_query);

  const { data, error } = await supabase.rpc('search_pets', {
    p_kind: intent.kind,
    p_species: intent.species,
    p_city_code: cityCode,
    p_department: department,
    p_colors: intent.colors.length ? intent.colors : null,
    p_size: intent.size,
    p_sex: intent.sex === 'desconocido' ? null : intent.sex,
    p_keywords: intent.keywords.length ? intent.keywords : null,
    p_status: options.status ?? 'activo',
    p_limit: options.limit ?? 40,
    p_offset: options.offset ?? 0,
  });

  if (error) throw new Error(`No se pudo buscar: ${error.message}`);
  return (data ?? []) as PetCard[];
}

export async function getPetBySlug(slug: string): Promise<Pet | null> {
  const supabase = adminClient();
  const { data, error } = await supabase.from('pets').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`No se pudo cargar la publicación: ${error.message}`);
  if (!data) return null;
  const { manage_token_hash: _hash, search_text: _text, ...pet } = data;
  return pet as Pet;
}

/** Otras publicaciones de la misma ciudad y especie, para sugerir coincidencias. */
export async function similarPets(pet: Pet, limit = 6): Promise<PetCard[]> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('pets')
    .select(CARD_COLUMNS)
    .eq('status', 'activo')
    .eq('species', pet.species)
    .eq('city_code', pet.city_code)
    // El complemento: si esta se perdió, mostramos las que alguien encontró.
    .eq('kind', pet.kind === 'perdido' ? 'encontrado' : 'perdido')
    .neq('id', pet.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as unknown as PetCard[];
}

export async function petStats(): Promise<{ activos: number; reunidos: number; ciudades: number }> {
  const supabase = adminClient();
  const { data, error } = await supabase.rpc('pet_stats');
  if (error || !data?.[0]) return { activos: 0, reunidos: 0, ciudades: 0 };
  const row = data[0];
  return {
    activos: Number(row.activos ?? 0),
    reunidos: Number(row.reunidos ?? 0),
    ciudades: Number(row.ciudades ?? 0),
  };
}
