import 'server-only';

import { adminClient } from './supabase';
import { hashManageToken } from './token';
import type { Pet } from './types';

export type ManagedPet = Pet & { manage_token_hash: string; search_text: string };

/**
 * Busca la publicación por el hash del código de gestión. El código en claro
 * nunca sale del navegador de quien publicó ni se guarda en la base.
 */
export async function findByToken(token: string): Promise<ManagedPet | null> {
  const { data, error } = await adminClient()
    .from('pets')
    .select('*')
    .eq('manage_token_hash', hashManageToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ManagedPet | null) ?? null;
}

/**
 * "No existe" y "no pude preguntar" son cosas distintas y hay que separarlas.
 * Si la base falla y respondemos 404, a la persona le decimos que su aviso
 * desapareció — el peor mensaje posible para quien está buscando a su mascota.
 */
export const DB_DOWN = {
  error: 'No pudimos consultar tu aviso en este momento. Volvé a intentar en un minuto.',
} as const;

/** Límites de fotos, compartidos entre publicar y editar. */
export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_MIME: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};
