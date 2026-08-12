import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

import { adminClient } from '@/lib/supabase';
import { whatsappNumber } from '@/lib/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cuántos teléfonos puede pedir una misma IP en un día. */
const DAILY_LIMIT = Number(process.env.CONTACT_REVEAL_LIMIT ?? 40);

/**
 * La IP nunca se guarda: se guarda un hash con sal. Alcanza para contar
 * consultas y cortar la recolección masiva, y no permite reconstruir quién
 * miró qué aviso.
 */
function hashIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim() || 'desconocida';
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'sal-local';
  return createHash('sha256').update(`${ip}|${salt}`).digest('hex');
}

/**
 * Entrega el teléfono de un aviso. Existe como endpoint aparte —y no dentro
 * del HTML— para que llevarse todos los números del sitio cueste una petición
 * por aviso en vez de una sola pasada por el sitemap.
 */
export async function POST(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = adminClient();

  try {
    const { data: allowed, error: limitError } = await supabase.rpc('bump_contact_reveal', {
      p_ip_hash: hashIp(_request),
      p_limit: DAILY_LIMIT,
    });

    // Si el contador falla, dejamos pasar: preferimos que alguien pueda llamar
    // por su mascota a bloquearlo por un problema nuestro.
    if (!limitError && allowed === false) {
      return NextResponse.json(
        {
          error:
            'Consultaste muchos contactos hoy. Si estás buscando a tu mascota y necesitás más, escribinos.',
        },
        { status: 429 },
      );
    }

    const { data, error } = await supabase
      .from('pets')
      .select('contact_name, contact_phone, contact_whatsapp, status')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: 'Ese aviso ya no existe.' }, { status: 404 });
    }

    return NextResponse.json({
      name: data.contact_name,
      phone: data.contact_phone,
      whatsapp: data.contact_whatsapp,
      waNumber: data.contact_whatsapp ? whatsappNumber(data.contact_phone) : null,
    });
  } catch (error) {
    console.error('contacto falló:', error);
    return NextResponse.json(
      { error: 'No pudimos cargar el contacto. Intentá otra vez.' },
      { status: 503 },
    );
  }
}
