import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * El código de gestión reemplaza al login. Quien tiene el link puede editar la
 * publicación, así que se genera con entropía criptográfica y solo se guarda
 * su hash: si alguien se lleva la base de datos, no se lleva los códigos.
 */
export function generateManageToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashManageToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compara en tiempo constante para no filtrar el código por tiempos de respuesta. */
export function manageTokenMatches(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashManageToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
