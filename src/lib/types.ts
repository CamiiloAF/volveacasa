// Vocabularios cerrados. La IA solo puede escoger de estas listas, tanto al
// describir una foto como al interpretar una búsqueda. Si los dos lados usan
// las mismas palabras, filtrar es comparar strings y no adivinar sinónimos.

export const SPECIES = ['perro', 'gato', 'otro'] as const;
export const KINDS = ['perdido', 'encontrado'] as const;
export const SIZES = ['pequeno', 'mediano', 'grande'] as const;
export const SEXES = ['macho', 'hembra', 'desconocido'] as const;
export const STATUSES = ['activo', 'reunido', 'archivado'] as const;

export const COLORS = [
  'negro',
  'blanco',
  'cafe',
  'chocolate',
  'canela',
  'dorado',
  'crema',
  'gris',
  'naranja',
  'atigrado',
  'manchado',
  'tricolor',
  'moteado',
] as const;

export const COATS = ['corto', 'medio', 'largo', 'rizado', 'sin pelo'] as const;

export type Species = (typeof SPECIES)[number];
export type Kind = (typeof KINDS)[number];
export type Size = (typeof SIZES)[number];
export type Sex = (typeof SEXES)[number];
export type Status = (typeof STATUSES)[number];
export type Color = (typeof COLORS)[number];

export const SIZE_LABEL: Record<Size, string> = {
  pequeno: 'Pequeño',
  mediano: 'Mediano',
  grande: 'Grande',
};

export const SEX_LABEL: Record<Sex, string> = {
  macho: 'Macho',
  hembra: 'Hembra',
  desconocido: 'Sin determinar',
};

export const SPECIES_LABEL: Record<Species, string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Otro animal',
};

export const COLOR_LABEL: Record<Color, string> = {
  negro: 'Negro',
  blanco: 'Blanco',
  cafe: 'Café',
  chocolate: 'Chocolate',
  canela: 'Canela',
  dorado: 'Dorado',
  crema: 'Crema',
  gris: 'Gris',
  naranja: 'Naranja',
  atigrado: 'Atigrado',
  manchado: 'Manchado',
  tricolor: 'Tricolor',
  moteado: 'Moteado',
};

/** Atributos físicos que la IA extrae de una foto, ya normalizados al dominio. */
export type PetAttributes = {
  species: Species | null;
  colors: Color[];
  size: Size | null;
  sex: Sex;
  coat: string | null;
  breed_guess: string | null;
  marks: string[];
  has_collar: boolean | null;
  collar_description: string | null;
  summary: string;
  keywords: string[];
};

/** Lo que la IA entiende de una búsqueda escrita en lenguaje natural. */
export type SearchIntent = {
  kind: Kind | null;
  species: Species | null;
  colors: Color[];
  size: Size | null;
  sex: Sex | null;
  city_query: string | null;
  keywords: string[];
};

export type Pet = {
  id: string;
  slug: string;
  kind: Kind;
  species: Species;
  status: Status;
  name: string | null;
  description: string;
  colors: string[];
  size: Size | null;
  sex: Sex;
  coat: string | null;
  marks: string[];
  has_collar: boolean | null;
  collar_description: string | null;
  breed_guess: string | null;
  ai_summary: string | null;
  ai_keywords: string[];
  city_code: string;
  city_name: string;
  department: string;
  neighborhood: string | null;
  event_date: string | null;
  contact_name: string;
  contact_phone: string;
  contact_whatsapp: boolean;
  reward: string | null;
  photos: string[];
  reunited_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Lo que se muestra en listados: sin datos de contacto ni token. */
export type PetCard = Omit<
  Pet,
  | 'contact_name'
  | 'contact_phone'
  | 'contact_whatsapp'
  | 'collar_description'
  | 'ai_keywords'
  | 'updated_at'
  | 'reunited_at'
> & { score?: number };
