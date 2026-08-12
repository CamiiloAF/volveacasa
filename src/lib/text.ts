/** Minúscula, sin tildes, sin puntuación. Es la forma en que guardamos y comparamos texto para buscar. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convierte un texto en un fragmento de URL legible. */
export function slugify(text: string): string {
  return normalize(text).replace(/ /g, '-').slice(0, 60).replace(/^-+|-+$/g, '');
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Sufijo corto para que dos "luna" en la misma ciudad no choquen. */
export function randomSuffix(length = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * Slug de una publicación. Lleva nombre y ciudad porque la URL se comparte por
 * WhatsApp y ahí el link se lee antes de que cargue la previsualización.
 */
export function buildSlug(input: {
  name: string | null;
  species: string;
  cityName: string;
}): string {
  const head = input.name?.trim() ? input.name : input.species;
  const base = slugify(`${head} ${input.cityName}`) || 'mascota';
  return `${base}-${randomSuffix()}`;
}

/**
 * Todo el texto buscable de una publicación en una sola línea normalizada.
 * La búsqueda por palabra clave corre sobre esto con un índice trigram.
 */
export function buildSearchText(input: {
  name: string | null;
  description: string;
  species: string;
  colors: string[];
  marks: string[];
  keywords: string[];
  breed_guess: string | null;
  coat: string | null;
  collar_description: string | null;
  ai_summary: string | null;
  city_name: string;
  department: string;
  neighborhood: string | null;
}): string {
  return normalize(
    [
      input.name ?? '',
      input.species,
      input.description,
      input.colors.join(' '),
      input.marks.join(' '),
      input.keywords.join(' '),
      input.breed_guess ?? '',
      input.coat ?? '',
      input.collar_description ?? '',
      input.ai_summary ?? '',
      input.city_name,
      input.department,
      input.neighborhood ?? '',
    ].join(' '),
  );
}

/** "hace 3 días", "hoy". Para fechas de publicación. */
export function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'hace un mes';
  if (months < 12) return `hace ${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'hace un año' : `hace ${years} años`;
}

/** Fecha larga en español: "12 de agosto de 2026". */
export function longDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Deja el teléfono en dígitos con indicativo de Colombia, listo para wa.me */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('57')) return digits;
  if (digits.length === 10) return `57${digits}`;
  return digits;
}
