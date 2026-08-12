import 'server-only';

import { adminClient } from './supabase';
import { normalize } from './text';
import type { SearchIntent } from './types';

/**
 * Caché de interpretaciones de búsqueda.
 *
 * "Gato negro" significa lo mismo hoy que mañana, así que preguntarle a la IA
 * cada vez es gastar el cupo por minuto —el límite que de verdad aprieta cuando
 * un aviso se comparte en un grupo grande— en una respuesta que ya teníamos.
 *
 * Si el caché falla, no pasa nada: se le pregunta a la IA como siempre. Nunca
 * puede ser el motivo de que una búsqueda no funcione.
 */

export function cacheKey(query: string): string {
  return normalize(query).slice(0, 200);
}

export async function getCachedIntent(query: string): Promise<SearchIntent | null> {
  const key = cacheKey(query);
  if (!key) return null;
  try {
    const { data, error } = await adminClient().rpc('search_cache_get', { p_query: key });
    if (error || !data) return null;
    return data as SearchIntent;
  } catch {
    return null;
  }
}

export async function putCachedIntent(query: string, intent: SearchIntent): Promise<void> {
  const key = cacheKey(query);
  if (!key) return;
  try {
    await adminClient().rpc('search_cache_put', { p_query: key, p_intent: intent });
  } catch {
    // Guardar en caché es una optimización, no un requisito.
  }
}
