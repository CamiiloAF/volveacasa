import type { Kind } from './types';

/**
 * Tipos y etiquetas de las coincidencias, sin `server-only`: los usa tanto la
 * página pública (servidor) como la de gestión (navegador).
 */
export type PetMatch = {
  id: string;
  slug: string;
  kind: Kind;
  name: string | null;
  ai_summary: string | null;
  description: string;
  colors: string[];
  city_name: string;
  neighborhood: string | null;
  photos: string[];
  created_at: string;
  score: number;
  reason: string;
};

/** Debajo de esto no se le muestra a nadie: no vale la ilusión. */
export const SHOW_THRESHOLD = 0.5;

/**
 * Cómo se le nombra a la persona el nivel de coincidencia.
 *
 * Nunca un porcentaje: "87% de coincidencia" suena a certeza y acá no la hay.
 * Quien decide si es su mascota es la familia mirando la foto.
 */
export function matchLabel(score: number): string {
  if (score >= 0.8) return 'Se parece mucho';
  if (score >= 0.65) return 'Se parece bastante';
  return 'Podría ser';
}
