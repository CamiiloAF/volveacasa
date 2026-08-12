import 'server-only';

import type { ComparablePet, MatchResult } from './ai';
import { SHOW_THRESHOLD, type PetMatch } from './match-shared';
import { adminClient } from './supabase';

/** Debajo de esto ni siquiera guardamos: es ruido y llenaría la tabla. */
const STORE_THRESHOLD = 0.4;

type CandidateRow = {
  id: string;
  slug: string;
  name: string | null;
  description: string;
  colors: string[];
  size: string | null;
  sex: string | null;
  coat: string | null;
  marks: string[];
  breed_guess: string | null;
  ai_summary: string | null;
  city_name: string;
  neighborhood: string | null;
  event_date: string | null;
  created_at: string;
};

/**
 * Avisos del tipo contrario que podrían ser el mismo animal.
 *
 * Es el prefiltro barato en SQL antes de gastar tokens: misma especie, tipo
 * contrario, activos, mismo municipio o al menos el mismo departamento. Se
 * llama ANTES de la llamada a la IA para poder mandarle las fotos y los
 * candidatos juntos, y resolver todo en una sola petición.
 */
export async function fetchCandidates(
  petId: string,
  limit = 6,
): Promise<{ rows: CandidateRow[]; comparables: ComparablePet[] }> {
  const { data, error } = await adminClient().rpc('match_candidates', {
    p_pet_id: petId,
    p_limit: limit,
  });

  if (error || !data?.length) {
    if (error) console.error('match_candidates falló:', error);
    return { rows: [], comparables: [] };
  }

  const rows = data as CandidateRow[];
  // La ref es el índice y no el id: el modelo nunca ve un identificador real,
  // así que no puede devolver uno inventado.
  const comparables = rows.map((row, index) => ({
    ref: String(index + 1),
    name: row.name,
    description: row.description,
    colors: row.colors ?? [],
    size: row.size,
    sex: row.sex,
    coat: row.coat,
    marks: row.marks ?? [],
    breed_guess: row.breed_guess,
    ai_summary: row.ai_summary,
    city_name: row.city_name,
    neighborhood: row.neighborhood,
    event_date: row.event_date,
    created_at: row.created_at,
  }));

  return { rows, comparables };
}

/** Guarda lo que la IA respondió sobre los candidatos. Devuelve cuántas se mostrarán. */
export async function storeMatches(input: {
  petId: string;
  petIsLost: boolean;
  rows: CandidateRow[];
  results: MatchResult[];
}): Promise<number> {
  const toStore = input.results
    .filter((result) => result.score >= STORE_THRESHOLD)
    .map((result) => {
      const candidate = input.rows[Number(result.ref) - 1];
      if (!candidate) return null;
      return {
        lost_id: input.petIsLost ? input.petId : candidate.id,
        found_id: input.petIsLost ? candidate.id : input.petId,
        score: result.score,
        reason: result.reason,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (toStore.length === 0) return 0;

  const { error } = await adminClient()
    .from('pet_matches')
    .upsert(toStore, { onConflict: 'lost_id,found_id' });

  if (error) {
    console.error('guardar coincidencias falló:', error);
    return 0;
  }

  return toStore.filter((row) => row.score >= SHOW_THRESHOLD).length;
}

/** Coincidencias de un aviso, las mejores primero. */
export async function getMatches(petId: string): Promise<PetMatch[]> {
  const { data, error } = await adminClient().rpc('pet_matches_for', {
    p_pet_id: petId,
    p_min_score: SHOW_THRESHOLD,
  });
  if (error) {
    console.error('pet_matches_for falló:', error);
    return [];
  }
  return (data ?? []) as PetMatch[];
}

export { matchLabel, SHOW_THRESHOLD, type PetMatch } from './match-shared';
