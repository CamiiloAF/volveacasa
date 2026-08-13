import { NextResponse } from 'next/server';
import { z } from 'zod';

import { aiEnabled, extractAttributes } from '@/lib/ai';
import { getMatches } from '@/lib/matching';
import { cityByCode } from '@/lib/cities';
import { adminClient } from '@/lib/supabase';
import { buildSearchText } from '@/lib/text';
import { DB_DOWN, findByToken, type ManagedPet } from '@/lib/manage';
import { COLORS, SEXES, SIZES } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  let pet: ManagedPet | null;
  try {
    pet = await findByToken(token);
  } catch (error) {
    console.error('findByToken falló:', error);
    return NextResponse.json(DB_DOWN, { status: 503 });
  }

  if (!pet) {
    return NextResponse.json({ error: 'Ese código de gestión no existe.' }, { status: 404 });
  }
  const { manage_token_hash: _h, search_text: _s, ...rest } = pet;
  // Las coincidencias van acá y no en un endpoint aparte: quien abre su link
  // de gestión es exactamente a quien hay que avisarle.
  const matches = await getMatches(pet.id).catch(() => []);
  return NextResponse.json({ pet: rest, matches });
}

const updateSchema = z.object({
  action: z.enum(['actualizar', 'reunido', 'reabrir', 'eliminar', 'reanalizar']),
  description: z.string().trim().min(10).max(2000).optional(),
  name: z.string().trim().max(60).nullable().optional(),
  cityCode: z.string().trim().optional(),
  neighborhood: z.string().trim().max(120).nullable().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contactName: z.string().trim().min(2).max(80).optional(),
  contactPhone: z.string().trim().min(7).max(30).optional(),
  contactWhatsapp: z.boolean().optional(),
  contactPhoneAlt: z.string().trim().max(30).nullable().optional(),
  reward: z.string().trim().max(120).nullable().optional(),
  colors: z.array(z.enum(COLORS)).max(4).optional(),
  size: z.enum(SIZES).nullable().optional(),
  sex: z.enum(SEXES).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  let pet: ManagedPet | null;
  try {
    pet = await findByToken(token);
  } catch (error) {
    console.error('findByToken falló:', error);
    return NextResponse.json(DB_DOWN, { status: 503 });
  }

  if (!pet) {
    return NextResponse.json({ error: 'Ese código de gestión no existe.' }, { status: 404 });
  }

  const supabase = adminClient();

  if (body.action === 'eliminar') {
    if (pet.photos.length) await supabase.storage.from('fotos').remove(pet.photos);
    const { error } = await supabase.from('pets').delete().eq('id', pet.id);
    if (error) {
      return NextResponse.json({ error: `No se pudo eliminar: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (body.action === 'reunido' || body.action === 'reabrir') {
    const reunido = body.action === 'reunido';
    const { error } = await supabase
      .from('pets')
      .update({
        status: reunido ? 'reunido' : 'activo',
        reunited_at: reunido ? new Date().toISOString() : null,
      })
      .eq('id', pet.id);
    if (error) {
      return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: reunido ? 'reunido' : 'activo' });
  }

  // --- reanalizar ---------------------------------------------------------
  // El análisis de las fotos puede fallar al publicar (la capa gratuita de
  // Gemini permite 20 peticiones por minuto, y un pico las agota). Sin esto,
  // un error de un segundo dejaba el aviso sin señas particulares para
  // siempre, y ese es justo el dato que hace que la búsqueda lo encuentre.
  if (body.action === 'reanalizar') {
    if (!aiEnabled()) {
      return NextResponse.json({ error: 'El análisis con IA no está disponible.' }, { status: 503 });
    }
    if (pet.photos.length === 0) {
      return NextResponse.json({ error: 'Este aviso no tiene fotos.' }, { status: 400 });
    }

    try {
      const images: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }[] = [];
      for (const path of pet.photos.slice(0, 4)) {
        const { data, error: downloadError } = await supabase.storage.from('fotos').download(path);
        if (downloadError || !data) continue;
        const mediaType = data.type === 'image/png'
          ? 'image/png'
          : data.type === 'image/webp'
            ? 'image/webp'
            : 'image/jpeg';
        images.push({
          mediaType,
          data: Buffer.from(await data.arrayBuffer()).toString('base64'),
        });
      }
      if (images.length === 0) {
        return NextResponse.json({ error: 'No pudimos leer las fotos.' }, { status: 500 });
      }

      const attributes = await extractAttributes({
        images,
        description: pet.description,
        species: pet.species,
      });

      // Lo que la persona ya ajustó a mano se respeta: la IA solo rellena.
      const colors = pet.colors.length ? pet.colors : attributes.colors;

      const { error: updateError } = await supabase
        .from('pets')
        .update({
          colors,
          size: pet.size ?? attributes.size,
          sex: pet.sex !== 'desconocido' ? pet.sex : attributes.sex,
          coat: attributes.coat,
          marks: attributes.marks,
          has_collar: attributes.has_collar,
          collar_description: attributes.collar_description,
          breed_guess: attributes.breed_guess,
          ai_summary: attributes.summary || null,
          ai_keywords: attributes.keywords,
          search_text: buildSearchText({
            name: pet.name,
            description: pet.description,
            species: pet.species,
            colors,
            marks: attributes.marks,
            keywords: attributes.keywords,
            breed_guess: attributes.breed_guess,
            coat: attributes.coat,
            collar_description: attributes.collar_description,
            ai_summary: attributes.summary,
            city_name: pet.city_name,
            department: pet.department,
            neighborhood: pet.neighborhood,
          }),
        })
        .eq('id', pet.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, summary: attributes.summary, marks: attributes.marks });
    } catch (error) {
      console.error('reanalizar falló:', error);
      const message = error instanceof Error && error.message.includes('429')
        ? 'La IA está saturada en este momento. Probá otra vez en un minuto.'
        : 'No pudimos analizar las fotos. Probá otra vez en un rato.';
      return NextResponse.json({ error: message }, { status: 503 });
    }
  }

  // --- actualizar ---------------------------------------------------------
  const city = body.cityCode ? cityByCode(body.cityCode) : null;
  if (body.cityCode && !city) {
    return NextResponse.json({ error: 'Esa ciudad no está en la lista.' }, { status: 400 });
  }

  const next = {
    name: body.name !== undefined ? body.name?.trim() || null : pet.name,
    description: body.description ?? pet.description,
    colors: body.colors ?? pet.colors,
    size: body.size !== undefined ? body.size : pet.size,
    sex: body.sex ?? pet.sex,
    city_code: city?.c ?? pet.city_code,
    city_name: city?.n ?? pet.city_name,
    department: city?.d ?? pet.department,
    neighborhood:
      body.neighborhood !== undefined ? body.neighborhood?.trim() || null : pet.neighborhood,
    event_date: body.eventDate !== undefined ? body.eventDate : pet.event_date,
    contact_name: body.contactName ?? pet.contact_name,
    contact_phone: body.contactPhone ?? pet.contact_phone,
    contact_whatsapp: body.contactWhatsapp ?? pet.contact_whatsapp,
    contact_phone_alt:
      body.contactPhoneAlt !== undefined
        ? body.contactPhoneAlt?.trim() || null
        : pet.contact_phone_alt,
    reward: body.reward !== undefined ? body.reward?.trim() || null : pet.reward,
  };

  const { error } = await supabase
    .from('pets')
    .update({
      ...next,
      search_text: buildSearchText({
        name: next.name,
        description: next.description,
        species: pet.species,
        colors: next.colors,
        marks: pet.marks,
        keywords: pet.ai_keywords,
        breed_guess: pet.breed_guess,
        coat: pet.coat,
        collar_description: pet.collar_description,
        ai_summary: pet.ai_summary,
        city_name: next.city_name,
        department: next.department,
        neighborhood: next.neighborhood,
      }),
    })
    .eq('id', pet.id);

  if (error) {
    return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, slug: pet.slug });
}
