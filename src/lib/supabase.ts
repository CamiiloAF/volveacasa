import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Único cliente de datos. Usa la service role key y salta RLS, así que solo se
 * puede llamar desde server components y route handlers — nunca desde código
 * que llegue al navegador.
 *
 * No hay cliente con llave anon a propósito: la tabla `pets` niega todo por RLS
 * para que nadie pueda descargarse la lista completa de teléfonos. El navegador
 * llega a los datos por las páginas renderizadas en el servidor y por
 * /api/buscar, no por Supabase directo.
 */
export function adminClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. Copiá .env.example a .env.local.',
    );
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** URL pública de una foto guardada en el bucket `fotos`. */
export function photoUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${url}/storage/v1/object/public/fotos/${path}`;
}
