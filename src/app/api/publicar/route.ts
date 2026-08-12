import { NextResponse } from 'next/server';
import { z } from 'zod';

import { extractAttributes, aiEnabled } from '@/lib/ai';
import { cityByCode } from '@/lib/cities';
import { adminClient } from '@/lib/supabase';
import { buildSearchText, buildSlug, randomSuffix } from '@/lib/text';
import { generateManageToken, hashManageToken } from '@/lib/token';
import { COLORS, KINDS, SEXES, SIZES, SPECIES, type PetAttributes } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PHOTOS = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const MIME: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

const payloadSchema = z.object({
  kind: z.enum(KINDS, { error: 'Indicá si se perdió o si lo encontraste.' }),
  species: z.enum(SPECIES, { error: 'Indicá qué animal es.' }),
  name: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().min(10, 'Contanos un poco más').max(2000),
  cityCode: z.string().trim().min(1, 'Escogé la ciudad'),
  neighborhood: z.string().trim().max(120).optional().nullable(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Revisá la fecha.')
    .optional()
    .nullable(),
  contactName: z.string().trim().min(2, 'Necesitamos tu nombre').max(80),
  contactPhone: z.string().trim().min(7, 'Revisá el teléfono').max(30),
  contactWhatsapp: z.boolean().default(true),
  reward: z.string().trim().max(120).optional().nullable(),
  // Lo que la persona corrigió a mano después de ver lo que detectó la IA.
  colors: z.array(z.enum(COLORS, { error: 'Ese color no está en la lista.' })).max(4).default([]),
  size: z.enum(SIZES, { error: 'Ese tamaño no está en la lista.' }).optional().nullable(),
  sex: z.enum(SEXES, { error: 'Ese sexo no está en la lista.' }).default('desconocido'),
});

/** Nombres de campo en español, para no mostrarle "kind" a quien publica. */
const FIELD_LABEL: Record<string, string> = {
  kind: 'si se perdió o lo encontraste',
  species: 'qué animal es',
  description: 'la descripción',
  cityCode: 'el municipio',
  contactName: 'tu nombre',
  contactPhone: 'el teléfono',
  colors: 'los colores',
  size: 'el tamaño',
  sex: 'el sexo',
  eventDate: 'la fecha',
};

/** Cómo empiezan los mensajes que genera zod cuando no le dimos uno propio. */
const ZOD_DEFAULT_PREFIXES = [
  'Invalid',
  'Expected',
  'Too small',
  'Too big',
  'Unrecognized',
  'Required',
  'Not a',
];

/**
 * Cada campo del esquema lleva su propio mensaje en español, así que casi
 * siempre alcanza con mostrarlo. La lista de arriba es la red de seguridad para
 * un campo al que se nos olvide ponerle mensaje: nunca le enseñamos a quien
 * publica un texto del validador en inglés.
 */
function friendlyError(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return 'Faltan datos por llenar.';
  const isZodDefault = ZOD_DEFAULT_PREFIXES.some((prefix) => issue.message.startsWith(prefix));
  if (!isZodDefault) return issue.message;

  const field = FIELD_LABEL[String(issue.path[0] ?? '')];
  return field ? `Revisá ${field}.` : 'Revisá los datos del formulario.';
}

function emptyAttributes(): PetAttributes {
  return {
    species: null,
    colors: [],
    size: null,
    sex: 'desconocido',
    coat: null,
    breed_guess: null,
    marks: [],
    has_collar: null,
    collar_description: null,
    summary: '',
    keywords: [],
  };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el formulario.' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(JSON.parse(String(form.get('datos') ?? '{}')));
  if (!parsed.success) {
    return NextResponse.json({ error: friendlyError(parsed.error.issues[0]) }, { status: 400 });
  }
  const data = parsed.data;

  const city = cityByCode(data.cityCode);
  if (!city) {
    return NextResponse.json({ error: 'Esa ciudad no está en la lista.' }, { status: 400 });
  }

  // --- Fotos --------------------------------------------------------------
  const files = form.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: 'Subí al menos una foto.' }, { status: 400 });
  }
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Máximo ${MAX_PHOTOS} fotos.` }, { status: 400 });
  }

  const images: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; bytes: Buffer }[] = [];
  for (const file of files) {
    const mediaType = MIME[file.type];
    if (!mediaType) {
      return NextResponse.json(
        { error: 'Las fotos deben ser JPG, PNG o WebP.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Cada foto debe pesar menos de 8 MB.' }, { status: 400 });
    }
    images.push({ mediaType, bytes: Buffer.from(await file.arrayBuffer()) });
  }

  const supabase = adminClient();
  const folder = `${new Date().toISOString().slice(0, 7)}/${randomSuffix(10)}`;
  const paths: string[] = [];

  for (const [index, image] of images.entries()) {
    const ext = image.mediaType.split('/')[1].replace('jpeg', 'jpg');
    const path = `${folder}/${index + 1}.${ext}`;
    const { error } = await supabase.storage
      .from('fotos')
      .upload(path, image.bytes, { contentType: image.mediaType, upsert: false });
    if (error) {
      return NextResponse.json(
        { error: `No se pudo guardar la foto: ${error.message}` },
        { status: 500 },
      );
    }
    paths.push(path);
  }

  // --- Atributos con IA ---------------------------------------------------
  // Si la IA falla, la publicación igual sale. Un aviso sin atributos se
  // encuentra por ciudad y por texto; uno que nunca se publicó no se encuentra.
  let attributes = emptyAttributes();
  let aiFailed = false;
  if (aiEnabled()) {
    try {
      attributes = await extractAttributes({
        images: images.map((i) => ({ mediaType: i.mediaType, data: i.bytes.toString('base64') })),
        description: data.description,
        species: data.species,
      });
    } catch (error) {
      aiFailed = true;
      console.error('extractAttributes falló:', error);
    }
  }

  // Lo que la persona escogió a mano manda sobre lo que detectó la IA.
  const colors = data.colors.length ? data.colors : attributes.colors;
  const size = data.size ?? attributes.size;
  const sex = data.sex !== 'desconocido' ? data.sex : attributes.sex;

  const slug = buildSlug({ name: data.name ?? null, species: data.species, cityName: city.n });

  const row = {
    slug,
    kind: data.kind,
    species: data.species,
    status: 'activo' as const,
    name: data.name?.trim() || null,
    description: data.description,
    colors,
    size,
    sex,
    coat: attributes.coat,
    marks: attributes.marks,
    has_collar: attributes.has_collar,
    collar_description: attributes.collar_description,
    breed_guess: attributes.breed_guess,
    ai_summary: attributes.summary || null,
    ai_keywords: attributes.keywords,
    city_code: city.c,
    city_name: city.n,
    department: city.d,
    neighborhood: data.neighborhood?.trim() || null,
    event_date: data.eventDate || null,
    contact_name: data.contactName,
    contact_phone: data.contactPhone,
    contact_whatsapp: data.contactWhatsapp,
    reward: data.reward?.trim() || null,
    photos: paths,
    search_text: buildSearchText({
      name: data.name ?? null,
      description: data.description,
      species: data.species,
      colors,
      marks: attributes.marks,
      keywords: attributes.keywords,
      breed_guess: attributes.breed_guess,
      coat: attributes.coat,
      collar_description: attributes.collar_description,
      ai_summary: attributes.summary,
      city_name: city.n,
      department: city.d,
      neighborhood: data.neighborhood ?? null,
    }),
    manage_token_hash: '',
  };

  const manageToken = generateManageToken();
  row.manage_token_hash = hashManageToken(manageToken);

  const { error } = await supabase.from('pets').insert(row);
  if (error) {
    await supabase.storage.from('fotos').remove(paths);
    return NextResponse.json(
      { error: `No se pudo publicar: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    slug,
    manageToken,
    aiFailed,
    detected: {
      colors: attributes.colors,
      size: attributes.size,
      breed_guess: attributes.breed_guess,
      marks: attributes.marks,
      summary: attributes.summary,
    },
  });
}
