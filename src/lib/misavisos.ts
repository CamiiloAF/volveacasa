/**
 * Los links de gestión que se publicaron desde este navegador.
 *
 * Del código de gestión solo guardamos su hash en el servidor, así que si
 * alguien pierde el link no hay forma de devolvérselo — y eso pasa seguido:
 * la gente publica angustiada y no guarda nada. Guardarlo también acá cubre el
 * caso más común (volver desde el mismo celular) sin exponer nada: nunca sale
 * de este dispositivo, no viaja al servidor y no depende de tener cuenta.
 *
 * No reemplaza guardar el link: si cambian de teléfono o borran los datos del
 * navegador, se pierde. Por eso al publicar seguimos insistiendo en que se lo
 * manden por WhatsApp.
 */

const KEY = 'volveacasa:mis-avisos';

export type SavedListing = {
  slug: string;
  /** Nombre de la mascota, o una etiqueta para reconocerla en la lista. */
  label: string;
  token: string;
  savedAt: string;
};

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    // Navegación privada o cookies bloqueadas: no es un error, simplemente no
    // podemos recordar nada.
    return false;
  }
}

function parse(raw: string | null): SavedListing[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedListing =>
        typeof item?.slug === 'string' &&
        typeof item?.token === 'string' &&
        typeof item?.label === 'string',
    );
  } catch {
    return [];
  }
}

// --- Store para useSyncExternalStore --------------------------------------
// React vuelve a pedir el snapshot en cada render, así que tiene que devolver
// exactamente el mismo arreglo mientras el contenido no cambie. Sin este caché
// entraría en un ciclo infinito de renders.

const EMPTY: SavedListing[] = [];
let cachedRaw: string | null = null;
let cachedValue: SavedListing[] = EMPTY;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToSavedListings(listener: () => void): () => void {
  listeners.add(listener);
  // 'storage' cubre los cambios hechos en otra pestaña.
  if (typeof window !== 'undefined') window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', listener);
  };
}

export function readSavedListings(): SavedListing[] {
  if (!canUseStorage()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedValue = parse(raw);
    }
    return cachedValue;
  } catch {
    return EMPTY;
  }
}

/**
 * En el servidor no hay localStorage. Devolvemos null (y no un arreglo vacío)
 * para que la interfaz distinga "todavía no sé" de "no hay ninguno": mostrarle
 * "no tenés avisos" por un instante a alguien que sí los tiene asusta de más.
 */
export function serverSnapshot(): null {
  return null;
}

export function saveListing(entry: Omit<SavedListing, 'savedAt'>): void {
  if (!canUseStorage()) return;
  try {
    const current = readSavedListings().filter((item) => item.slug !== entry.slug);
    const next = [{ ...entry, savedAt: new Date().toISOString() }, ...current].slice(0, 30);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    notify();
  } catch {
    // Sin espacio o sin permiso: seguimos, el link ya se le mostró en pantalla.
  }
}

export function forgetListing(slug: string): void {
  if (!canUseStorage()) return;
  try {
    const next = readSavedListings().filter((item) => item.slug !== slug);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    notify();
  } catch {
    // Nada que hacer.
  }
}
