import 'server-only';

import { GoogleGenAI } from '@google/genai';
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

/**
 * Flash-Lite y no Flash, medido contra la API real:
 *
 * - `gemini-3.6-flash` agota su cuota gratuita a las 20 peticiones. Sirve para
 *   probar, no para tener la app abierta al público sin facturación activa.
 * - `gemini-3.5-flash-lite` tiene cuota gratuita usable, es el tramo más barato
 *   al escalar, y describiendo la foto de una mascota se comporta casi igual:
 *   saca los colores, el tamaño y las señas particulares.
 *
 * Para "mirá esta foto y decime cómo es este gato" no hace falta un modelo de
 * frontera, y esta app tiene que poder sostenerse sin ingresos.
 *
 * Con facturación activa, `gemini-3.6-flash` da algo más de detalle: se cambia
 * por GEMINI_MODEL, sin tocar código.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';

/**
 * Un 429 no se arregla reintentando: la cuota sigue agotada, y cada reintento
 * consume otra petición y retrasa la respuesta. Preferimos fallar rápido y
 * dejar que el llamador use su plan B.
 */
const REQUEST_OPTIONS = { maxRetries: 1 } as const;

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Falta GEMINI_API_KEY. Copiá .env.example a .env.local.');
  }
  cached ??= new GoogleGenAI({});
  return cached;
}

export function aiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// ---------------------------------------------------------------------------
// Esquemas de salida
//
// Nada es nullable a propósito: en vez de `null` usamos un valor explícito
// ('no_se', 'cualquiera', ''). Gemini acepta un subconjunto de OpenAPI 3.0, así
// que nos quedamos en lo básico —type, properties, required, enum, items— y un
// enum cerrado le da al modelo una salida obvia cuando la foto no alcanza.
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
};

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
};

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

/**
 * `response_format` obliga a JSON válido, pero un modelo puede devolver texto
 * vacío si algo se atraviesa. Fallamos con un mensaje claro en vez de dejar que
 * reviente un `JSON.parse` a mitad de camino.
 */
function parseJson(output: string | undefined, context: string): unknown {
  if (!output?.trim()) {
    throw new Error(`Gemini devolvió una respuesta vacía al ${context}.`);
  }
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Gemini devolvió algo que no es JSON al ${context}.`);
  }
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
  const hints: string[] = [];
  if (input.species) hints.push(`Quien publica dice que es un ${input.species}.`);
  if (input.description.trim()) {
    hints.push(`Lo que escribió quien publica:\n"""\n${input.description.trim()}\n"""`);
  }

  const prompt =
    (hints.length
      ? `${hints.join('\n\n')}\n\n`
      : 'No hay descripción escrita; guiate solo por las fotos.\n\n') +
    'Describí los rasgos físicos del animal de las fotos. Si la descripción escrita menciona algo que no se ve en la foto (por ejemplo una cicatriz tapada), podés incluirlo igual: quien publica conoce al animal.';

  const interaction = await client().interactions.create({
    model: MODEL,
    system_instruction: EXTRACT_SYSTEM,
    input: [
      ...input.images.slice(0, 4).map((image) => ({
        type: 'image' as const,
        data: image.data,
        mime_type: image.mediaType,
      })),
      { type: 'text' as const, text: prompt },
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: attributesSchema,
    },
    generation_config: {
      // OJO: max_output_tokens incluye los tokens de razonamiento. Con el
      // presupuesto justo, el modelo piensa hasta agotarlo y devuelve el JSON
      // cortado a la mitad. Dejamos aire de sobra y limitamos el razonamiento.
      max_output_tokens: 8000,
      thinking_level: 'low',
    },
  }, REQUEST_OPTIONS);

  const raw = attributesParser.parse(parseJson(interaction.output_text, 'analizar las fotos'));

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
- No deduzcas nada que no esté dicho. Un diminutivo como "gatico", "perrito" o "michi" NO indica tamaño. El género gramatical de una palabra NO indica el sexo del animal: "perrita" puede ser como la llama quien la busca, no un dato. Ante la duda, "cualquiera".
- "kind": "perdido" si buscan un animal que se perdió, "encontrado" si buscan entre los que alguien recogió. Frases como "vi un perro en la calle" o "me encontré un gato" describen un hallazgo, así que quien las escribe suele estar buscando al dueño: eso es "perdido". "se me perdió mi gata" también es "perdido". Si no queda claro, "cualquiera".
- "colors": solo los colores que la persona nombró. "café", "marrón" y "chocolate" son tonos distintos: escogé el más cercano. "amarillo" y "beige" suelen ser "dorado" o "crema".
- "city_query": el nombre del municipio o barrio tal como lo escribieron, sin el departamento. Vacío si no mencionaron lugar.
- "keywords": los rasgos que no caben en los otros campos, en español, minúscula y sin tildes. Frases de dos o tres palabras están bien si describen una seña ("mancha blanca", "oreja caida", "cola corta"). No repitas colores ni especie que ya pusiste en su campo. No incluyas la ciudad.

Escribí siempre en español.`;

export async function parseSearchQuery(query: string): Promise<SearchIntent> {
  const interaction = await client().interactions.create({
    model: MODEL,
    system_instruction: SEARCH_SYSTEM,
    input: `Búsqueda: """${query.trim()}"""`,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: intentSchema,
    },
    generation_config: {
      // Ver la nota en extractAttributes: el presupuesto lo comparten el
      // razonamiento y la respuesta. Interpretar una búsqueda no necesita
      // pensar mucho, y pensar de más además hace que invente filtros.
      max_output_tokens: 4000,
      thinking_level: 'low',
    },
  }, REQUEST_OPTIONS);

  const raw = intentParser.parse(parseJson(interaction.output_text, 'interpretar la búsqueda'));

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

// ---------------------------------------------------------------------------
// Cruce entre avisos perdidos y encontrados
// ---------------------------------------------------------------------------

const COMPARE_SYSTEM = `Sos parte de Volvé a Casa, una plataforma colombiana de mascotas perdidas y encontradas. Te damos un aviso y varios avisos del tipo contrario en la misma zona. Decidís, para cada uno, qué tan probable es que se trate del MISMO animal.

Cómo calibrar la probabilidad:
- 0.9 a 1.0: coinciden en especie, colores y al menos una seña particular específica y poco común (una mancha con forma y ubicación, una oreja caída, una cicatriz, ojos de distinto color).
- 0.6 a 0.8: coinciden en lo general y en algún detalle, pero falta confirmar algo o hay un dato que no calza.
- 0.3 a 0.5: podrían serlo, pero solo coinciden rasgos comunes (un perro café mediano se parece a miles de perros cafés medianos).
- 0.0 a 0.2: hay algo que los descarta — otra especie, colores incompatibles, o que el encontrado apareció antes de que el otro se perdiera.

Tené en cuenta al comparar:
- Dos personas describen distinto al mismo animal. Quien lo crió sabe la raza y el nombre; quien lo recogió en la calle solo ve un perro flaco y asustado. Que uno diga "mediano" y el otro "grande" no descarta nada.
- El sexo suele estar sin determinar en los animales encontrados. Que no coincida no descarta; que coincida tampoco confirma mucho.
- Las fechas sí importan: si lo encontraron antes de que se perdiera, no puede ser el mismo animal.
- Un animal perdido cruza de barrio y hasta de municipio. La distancia no descarta.

En "razon", explicá en una o dos frases, en español claro y para la familia que lo va a leer, qué coincide y qué no. Nombrá los detalles concretos. Si la probabilidad es baja, decí por qué no calza.

Ser demasiado optimista tiene un costo real: le das falsas esperanzas a una familia que está sufriendo. Ser demasiado estricto tiene otro: se pierde un reencuentro. Calibrá con honestidad.`;

const compareSchema = {
  type: 'object',
  properties: {
    comparaciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          probabilidad: { type: 'number' },
          razon: { type: 'string' },
        },
        required: ['ref', 'probabilidad', 'razon'],
      },
    },
  },
  required: ['comparaciones'],
};

const compareParser = z.object({
  comparaciones: z.array(
    z.object({ ref: z.string(), probabilidad: z.number(), razon: z.string() }),
  ),
});

/** Un aviso reducido a lo que sirve para compararlo con otro. */
export type ComparablePet = {
  ref: string;
  kind: Kind;
  name?: string | null;
  description: string;
  colors: string[];
  size?: string | null;
  sex?: string | null;
  coat?: string | null;
  marks: string[];
  breed_guess?: string | null;
  ai_summary?: string | null;
  city_name: string;
  neighborhood?: string | null;
  event_date?: string | null;
  created_at: string;
};

function describe(pet: ComparablePet): string {
  const partes = [
    `Tipo: ${pet.kind === 'perdido' ? 'se perdió' : 'lo encontraron'}`,
    pet.name ? `Nombre: ${pet.name}` : null,
    pet.ai_summary ? `Resumen: ${pet.ai_summary}` : null,
    pet.colors.length ? `Colores: ${pet.colors.join(', ')}` : null,
    pet.size ? `Tamaño: ${pet.size}` : null,
    pet.sex && pet.sex !== 'desconocido' ? `Sexo: ${pet.sex}` : null,
    pet.coat ? `Pelaje: ${pet.coat}` : null,
    pet.breed_guess ? `Raza aparente: ${pet.breed_guess}` : null,
    pet.marks.length ? `Señas: ${pet.marks.join('; ')}` : null,
    `Lugar: ${pet.neighborhood ? `${pet.neighborhood}, ` : ''}${pet.city_name}`,
    pet.event_date ? `Fecha del hecho: ${pet.event_date}` : null,
    `Publicado: ${pet.created_at.slice(0, 10)}`,
    `Lo que escribió la persona: ${pet.description.slice(0, 400)}`,
  ].filter(Boolean);
  return partes.join('\n');
}

/**
 * Compara un aviso contra varios candidatos del tipo contrario y devuelve, por
 * cada uno, qué tan probable es que sean el mismo animal.
 */
export async function comparePets(
  target: ComparablePet,
  candidates: ComparablePet[],
): Promise<{ ref: string; score: number; reason: string }[]> {
  if (candidates.length === 0) return [];

  const prompt = [
    'AVISO A COMPARAR:',
    describe(target),
    '',
    'CANDIDATOS:',
    ...candidates.map((c) => `--- ref ${c.ref} ---\n${describe(c)}`),
    '',
    `Devolvé una comparación por cada candidato, usando exactamente estas refs: ${candidates
      .map((c) => c.ref)
      .join(', ')}.`,
  ].join('\n');

  const interaction = await client().interactions.create(
    {
      model: MODEL,
      system_instruction: COMPARE_SYSTEM,
      input: prompt,
      response_format: { type: 'text', mime_type: 'application/json', schema: compareSchema },
      generation_config: { max_output_tokens: 8000, thinking_level: 'low' },
    },
    REQUEST_OPTIONS,
  );

  const raw = compareParser.parse(parseJson(interaction.output_text, 'comparar los avisos'));
  const validRefs = new Set(candidates.map((c) => c.ref));

  return raw.comparaciones
    .filter((c) => validRefs.has(c.ref))
    .map((c) => ({
      ref: c.ref,
      score: Math.max(0, Math.min(1, c.probabilidad)),
      reason: c.razon.trim(),
    }));
}
