import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import {
  COATS,
  COLORS,
  KINDS,
  SEXES,
  SIZES,
  SPECIES,
  type Color,
  type Kind,
  type PetAttributes,
  type SearchIntent,
  type Sex,
  type Size,
  type Species,
} from './types';

const MODEL = 'claude-opus-5';

let cached: Anthropic | null = null;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Falta ANTHROPIC_API_KEY. Copiá .env.example a .env.local.');
  }
  cached ??= new Anthropic();
  return cached;
}

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---------------------------------------------------------------------------
// Esquemas de salida
//
// Nada es nullable a propósito: en vez de `null` usamos un valor explícito
// ('no_se', 'cualquiera', ''). Los structured outputs no aceptan esquemas
// recursivos ni restricciones de longitud, y un enum cerrado le da al modelo
// una salida obvia cuando la foto no alcanza para saberlo.
// ---------------------------------------------------------------------------

const UNKNOWN = 'no_se';
const ANY = 'cualquiera';

const attributesSchema = {
  type: 'object',
  properties: {
    species: { type: 'string', enum: [...SPECIES, UNKNOWN] },
    colors: { type: 'array', items: { type: 'string', enum: [...COLORS] } },
    size: { type: 'string', enum: [...SIZES, UNKNOWN] },
    sex: { type: 'string', enum: [...SEXES] },
    coat: { type: 'string', enum: [...COATS, UNKNOWN] },
    breed_guess: { type: 'string' },
    marks: { type: 'array', items: { type: 'string' } },
    has_collar: { type: 'string', enum: ['si', 'no', UNKNOWN] },
    collar_description: { type: 'string' },
    summary: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'species',
    'colors',
    'size',
    'sex',
    'coat',
    'breed_guess',
    'marks',
    'has_collar',
    'collar_description',
    'summary',
    'keywords',
  ],
  additionalProperties: false,
} as const;

const attributesParser = z.object({
  species: z.string(),
  colors: z.array(z.string()),
  size: z.string(),
  sex: z.string(),
  coat: z.string(),
  breed_guess: z.string(),
  marks: z.array(z.string()),
  has_collar: z.string(),
  collar_description: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()),
});

const intentSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...KINDS, ANY] },
    species: { type: 'string', enum: [...SPECIES, ANY] },
    colors: { type: 'array', items: { type: 'string', enum: [...COLORS] } },
    size: { type: 'string', enum: [...SIZES, ANY] },
    sex: { type: 'string', enum: ['macho', 'hembra', ANY] },
    city_query: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
  },
  required: ['kind', 'species', 'colors', 'size', 'sex', 'city_query', 'keywords'],
  additionalProperties: false,
} as const;

const intentParser = z.object({
  kind: z.string(),
  species: z.string(),
  colors: z.array(z.string()),
  size: z.string(),
  sex: z.string(),
  city_query: z.string(),
  keywords: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function firstTextBlock(content: Anthropic.ContentBlock[]): string {
  for (const block of content) {
    if (block.type === 'text') return block.text;
  }
  return '';
}

function pickEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function cleanKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const word = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9ñ ]/g, ' ')
      .trim();
    if (word.length >= 3 && word.length <= 40) seen.add(word);
    if (seen.size >= 14) break;
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// Extracción de atributos desde fotos
// ---------------------------------------------------------------------------

const EXTRACT_SYSTEM = `Sos parte de Volvé a Casa, una plataforma colombiana para reunir mascotas perdidas con sus familias. Tu trabajo es mirar las fotos de un animal y describir sus rasgos físicos de forma que otra persona pueda reconocerlo.

Reglas:
- Describí SOLO lo que ves en la foto. Si un rasgo no se distingue, usá "no_se" o dejá el campo vacío. Un dato inventado hace que la familia equivocada llame, y eso hace daño.
- "colors" son los colores dominantes del pelaje, máximo tres, del más presente al menos presente.
- "marks" son señas particulares que sirvan para identificarlo entre animales parecidos: manchas y dónde están, orejas caídas o paradas, cola larga o corta, una pata de otro color, cicatrices, ojos de colores distintos. Escribilas cortas y concretas, en español, minúscula, sin punto final: "mancha blanca en el pecho", "oreja izquierda caída".
- "breed_guess" es la raza aparente o la mezcla más probable. Si es criollo o no se distingue, dejalo vacío.
- "summary" es una frase de una sola línea que alguien podría leer en voz alta para buscarlo, sin nombre propio ni ubicación. Ejemplo: "Gato negro de pelo corto con una mancha blanca en el pecho y ojos verdes".
- "keywords" son palabras sueltas en español, minúscula y sin tildes, que alguien podría escribir al buscarlo: colores, partes del cuerpo, rasgos, raza. Sin nombres propios ni ciudades.

Escribí siempre en español de Colombia.`;

type ImageInput = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };

export async function extractAttributes(input: {
  images: ImageInput[];
  description: string;
  species?: Species | null;
}): Promise<PetAttributes> {
  const content: Anthropic.ContentBlockParam[] = input.images.slice(0, 4).map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data },
  }));

  const hints: string[] = [];
  if (input.species) hints.push(`Quien publica dice que es un ${input.species}.`);
  if (input.description.trim()) {
    hints.push(`Lo que escribió quien publica:\n"""\n${input.description.trim()}\n"""`);
  }

  content.push({
    type: 'text',
    text:
      (hints.length
        ? `${hints.join('\n\n')}\n\n`
        : 'No hay descripción escrita; guiate solo por las fotos.\n\n') +
      'Describí los rasgos físicos del animal de las fotos. Si la descripción escrita menciona algo que no se ve en la foto (por ejemplo una cicatriz tapada), podés incluirlo igual: quien publica conoce al animal.',
  });

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: EXTRACT_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: attributesSchema } },
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('El modelo no pudo analizar estas fotos.');
  }

  const raw = attributesParser.parse(JSON.parse(firstTextBlock(response.content)));

  return {
    species: pickEnum<Species>(raw.species, SPECIES),
    colors: raw.colors
      .map((c) => pickEnum<Color>(c, COLORS))
      .filter((c): c is Color => c !== null)
      .slice(0, 3),
    size: pickEnum<Size>(raw.size, SIZES),
    sex: pickEnum<Sex>(raw.sex, SEXES) ?? 'desconocido',
    coat: raw.coat === UNKNOWN ? null : raw.coat || null,
    breed_guess: raw.breed_guess.trim() || null,
    marks: raw.marks.map((m) => m.trim()).filter(Boolean).slice(0, 6),
    has_collar: raw.has_collar === 'si' ? true : raw.has_collar === 'no' ? false : null,
    collar_description: raw.collar_description.trim() || null,
    summary: raw.summary.trim(),
    keywords: cleanKeywords(raw.keywords),
  };
}

// ---------------------------------------------------------------------------
// Interpretación de búsquedas en lenguaje natural
// ---------------------------------------------------------------------------

const SEARCH_SYSTEM = `Sos el buscador de Volvé a Casa, una plataforma colombiana de mascotas perdidas y encontradas. Recibís lo que alguien escribió en la barra de búsqueda y lo convertís en filtros.

Reglas:
- Usá "cualquiera" en todo filtro que la persona no haya dicho explícitamente. Filtrar de más esconde justo al animal que están buscando.
- "kind": "perdido" si buscan un animal que se perdió, "encontrado" si buscan entre los que alguien recogió. Frases como "vi un perro en la calle" o "me encontré un gato" describen un hallazgo, así que quien las escribe suele estar buscando al dueño: eso es "perdido". "se me perdió mi gata" también es "perdido". Si no queda claro, "cualquiera".
- "colors": solo los colores que la persona nombró. "café", "marrón" y "chocolate" son tonos distintos: escogé el más cercano. "amarillo" y "beige" suelen ser "dorado" o "crema".
- "city_query": el nombre del municipio o barrio tal como lo escribieron, sin el departamento. Vacío si no mencionaron lugar.
- "keywords": los rasgos que no caben en los otros campos, en español, minúscula y sin tildes. Frases de dos o tres palabras están bien si describen una seña ("mancha blanca", "oreja caida", "cola corta"). No repitas colores ni especie que ya pusiste en su campo. No incluyas la ciudad.

Escribí siempre en español.`;

export async function parseSearchQuery(query: string): Promise<SearchIntent> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: SEARCH_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: intentSchema } },
    messages: [{ role: 'user', content: `Búsqueda: """${query.trim()}"""` }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('No se pudo interpretar la búsqueda.');
  }

  const raw = intentParser.parse(JSON.parse(firstTextBlock(response.content)));

  return {
    kind: pickEnum<Kind>(raw.kind, KINDS),
    species: pickEnum<Species>(raw.species, SPECIES),
    colors: raw.colors
      .map((c) => pickEnum<Color>(c, COLORS))
      .filter((c): c is Color => c !== null)
      .slice(0, 4),
    size: pickEnum<Size>(raw.size, SIZES),
    sex: pickEnum<Sex>(raw.sex, SEXES),
    city_query: raw.city_query.trim() || null,
    keywords: cleanKeywords(raw.keywords).slice(0, 10),
  };
}
