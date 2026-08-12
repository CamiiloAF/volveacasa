import 'server-only';

import { aiEnabled, comparePets, type ComparablePet } from './ai';
import { SHOW_THRESHOLD, type PetMatch } from './match-shared';
import { adminClient } from './supabase';
import type { Kind } from './types';

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
 * Busca avisos del tipo contrario que puedan ser el mismo animal y guarda las
 * coincidencias.
 *
 * Corre después de responderle a quien publica (con `after()` de Next), porque
 * es una segunda llamada a la IA y publicar ya se siente lento. Si falla, no
 * pasa nada grave: el aviso quedó publicado y el cruce se puede reintentar.
 */
export async function findAndStoreMatches(petId: string): Promise<number> {
  if (!aiEnabled()) return 0;

  const supabase = adminClient();

  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select(
      'id, kind, name, description, colors, size, sex, coat, marks, breed_guess, ai_summary, city_name, neighborhood, event_date, created_at, status',
    )
    .eq('id', petId)
    .maybeSingle();

  if (petError || !pet || pet.status !== 'activo') return 0;

  const { data: candidates, error: candidatesError } = await supabase.rpc('match_candidates', {
    p_pet_id: petId,
    p_limit: 6,
  });

  if (candidatesError || !candidates?.length) return 0;

  const rows = candidates as CandidateRow[];
  const target: ComparablePet = { ref: 'objetivo', kind: pet.kind as Kind, ...toComparable(pet) };
  // La ref es el índice: no le pasamos los ids al modelo, así que no puede
  // devolver uno inventado.
  const comparables: ComparablePet[] = rows.map((row, index) => ({
    ref: String(index + 1),
    kind: (pet.kind === 'perdido' ? 'encontrado' : 'perdido') as Kind,
    ...toComparable(row),
  }));

  let results: { ref: string; score: number; reason: string }[];
  try {
    results = await comparePets(target, comparables);
  } catch (error) {
    console.error('comparePets falló:', error);
    return 0;
  }

  const petIsLost = pet.kind === 'perdido';
  const toStore = results
    .filter((result) => result.score >= STORE_THRESHOLD)
    .map((result) => {
      const candidate = rows[Number(result.ref) - 1];
      if (!candidate) return null;
      return {
        lost_id: petIsLost ? pet.id : candidate.id,
        found_id: petIsLost ? candidate.id : pet.id,
        score: result.score,
        reason: result.reason,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (toStore.length === 0) return 0;

  const { error: upsertError } = await supabase
    .from('pet_matches')
    .upsert(toStore, { onConflict: 'lost_id,found_id' });

  if (upsertError) {
    console.error('guardar coincidencias falló:', upsertError);
    return 0;
  }

  return toStore.filter((row) => row.score >= SHOW_THRESHOLD).length;
}

function toComparable(row: {
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
}): Omit<ComparablePet, 'ref' | 'kind'> {
  return {
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
  };
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
