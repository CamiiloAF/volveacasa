import { NextResponse } from 'next/server';
import { z } from 'zod';

import { cityByCode } from '@/lib/cities';
import { adminClient } from '@/lib/supabase';
import { buildSearchText } from '@/lib/text';
import { hashManageToken } from '@/lib/token';
import { COLORS, SEXES, SIZES, type Pet } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Busca la publicación por el hash del código. El código en claro nunca sale
 * del navegador de quien publicó ni se guarda en la base.
 */
async function findByToken(token: string) {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('manage_token_hash', hashManageToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as (Pet & { manage_token_hash: string; search_text: string }) | null;
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const pet = await findByToken(token);
  if (!pet) {
    return NextResponse.json({ error: 'Ese código de gestión no existe.' }, { status: 404 });
  }
  const { manage_token_hash: _h, search_text: _s, ...rest } = pet;
  return NextResponse.json({ pet: rest });
}

const updateSchema = z.object({
  action: z.enum(['actualizar', 'reunido', 'reabrir', 'eliminar']),
  description: z.string().trim().min(10).max(2000).optional(),
  name: z.string().trim().max(60).nullable().optional(),
  cityCode: z.string().trim().optional(),
  neighborhood: z.string().trim().max(120).nullable().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contactName: z.string().trim().min(2).max(80).optional(),
  contactPhone: z.string().trim().min(7).max(30).optional(),
  contactWhatsapp: z.boolean().optional(),
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

  const pet = await findByToken(token);
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
