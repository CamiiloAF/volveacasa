import { ImageResponse } from 'next/og';

import { getPetBySlug } from '@/lib/pets';
import { photoUrl } from '@/lib/supabase';
import { SPECIES_LABEL } from '@/lib/types';

// 600x315 y no 1200x630: WhatsApp descarta la previsualización cuando la
// imagen pesa de más, y a 1200x630 este PNG daba 773 KB — por eso los avisos
// se compartían sin foto. A esta medida pesa ~224 KB y siempre se ve.
export const size = { width: 600, height: 315 };
export const contentType = 'image/png';
export const alt = 'Aviso de mascota en Volvé a Casa';

/**
 * Previsualización que se ve al pegar el link en WhatsApp o Facebook. Es la
 * razón de ser de toda la app: un aviso circula porque alguien ve la carita del
 * animal en el chat, no porque lea una URL.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pet = await getPetBySlug(slug).catch(() => null);

  if (!pet) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fbf7f0',
            color: '#0e7c6b',
            fontSize: 32,
            fontWeight: 800,
          }}
        >
          Volvé a Casa
        </div>
      ),
      { ...size,
      headers: {
        // Sin esto se regeneraba en cada visita del crawler (x-vercel-cache:
        // MISS siempre), y una previsualización lenta es una que no se ve.
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
      },
    );
  }

  const name = pet.name?.trim();
  const reunited = pet.status === 'reunido';
  const title = reunited
    ? name
      ? `${name} ya volvió a casa 🎉`
      : 'Ya volvió a casa 🎉'
    : pet.kind === 'perdido'
      ? name
        ? `¿Has visto a ${name}?`
        : `Se perdió un ${SPECIES_LABEL[pet.species].toLowerCase()}`
      : `Se encontró un ${SPECIES_LABEL[pet.species].toLowerCase()}`;

  const badge = reunited ? 'YA ESTÁ EN CASA' : pet.kind === 'perdido' ? 'SE PERDIÓ' : 'LO ENCONTRARON';
  const badgeColor = reunited ? '#7c3aed' : pet.kind === 'perdido' ? '#c2410c' : '#0e7c6b';
  const cover = pet.photos[0] ? photoUrl(pet.photos[0]) : null;
  const summary = pet.ai_summary || pet.description;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#fbf7f0' }}>
        {cover && (
          <img
            src={cover}
            alt=""
            width={260}
            height={315}
            style={{ width: 260, height: 315, objectFit: 'cover' }}
          />
        )}

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 28,
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              background: badgeColor,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              padding: '5px 11px',
              borderRadius: 999,
              letterSpacing: 1,
            }}
          >
            {badge}
          </div>

          <div style={{ display: 'flex', fontSize: 29, fontWeight: 800, color: '#1c2523', lineHeight: 1.1 }}>
            {title}
          </div>

          <div style={{ display: 'flex', fontSize: 14, color: '#5c6663', lineHeight: 1.35 }}>
            {summary.length > 110 ? `${summary.slice(0, 110)}…` : summary}
          </div>

          <div style={{ display: 'flex', fontSize: 15, fontWeight: 600, color: '#1c2523' }}>
            {pet.city_name}, {pet.department}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 4,
              fontSize: 13,
              fontWeight: 700,
              color: '#0e7c6b',
            }}
          >
            Volvé a Casa
          </div>
        </div>
      </div>
    ),
    { ...size,
      headers: {
        // Sin esto se regeneraba en cada visita del crawler (x-vercel-cache:
        // MISS siempre), y una previsualización lenta es una que no se ve.
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
