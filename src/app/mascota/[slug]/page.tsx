import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ShareButtons } from '@/components/ShareButtons';
import { KindBadge, PetGrid } from '@/components/PetCard';
import { getPetBySlug, similarPets } from '@/lib/pets';
import { photoUrl } from '@/lib/supabase';
import { longDate, relativeDate, whatsappNumber } from '@/lib/text';
import {
  COLOR_LABEL,
  SEX_LABEL,
  SIZE_LABEL,
  SPECIES_LABEL,
  type Color,
  type Pet,
} from '@/lib/types';

export const revalidate = 60;

function headline(pet: Pet): string {
  const name = pet.name?.trim();
  if (pet.status === 'reunido') {
    return name ? `${name} ya volvió a casa` : 'Ya volvió a casa';
  }
  if (pet.kind === 'perdido') {
    return name ? `¿Has visto a ${name}?` : `Se perdió un ${SPECIES_LABEL[pet.species].toLowerCase()}`;
  }
  return `Se encontró un ${SPECIES_LABEL[pet.species].toLowerCase()} — buscamos a su familia`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pet = await getPetBySlug(slug).catch(() => null);
  if (!pet) return { title: 'Aviso no encontrado' };

  const title = headline(pet);
  const description = [
    pet.ai_summary || pet.description.slice(0, 140),
    `${pet.neighborhood ? `${pet.neighborhood}, ` : ''}${pet.city_name}, ${pet.department}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    title,
    description,
    alternates: { canonical: `/mascota/${pet.slug}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/mascota/${pet.slug}`,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function PetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pet = await getPetBySlug(slug).catch(() => null);
  if (!pet) notFound();

  const similar = await similarPets(pet).catch(() => []);
  const lost = pet.kind === 'perdido';
  const reunited = pet.status === 'reunido';
  const wa = whatsappNumber(pet.contact_phone);

  const facts: { label: string; value: string }[] = [
    { label: 'Especie', value: SPECIES_LABEL[pet.species] },
    pet.breed_guess ? { label: 'Raza aparente', value: pet.breed_guess } : null,
    pet.colors.length
      ? {
          label: 'Colores',
          value: pet.colors.map((c) => COLOR_LABEL[c as Color] ?? c).join(', '),
        }
      : null,
    pet.size ? { label: 'Tamaño', value: SIZE_LABEL[pet.size] } : null,
    pet.sex !== 'desconocido' ? { label: 'Sexo', value: SEX_LABEL[pet.sex] } : null,
    pet.coat ? { label: 'Pelaje', value: pet.coat } : null,
    pet.has_collar === true
      ? { label: 'Collar', value: pet.collar_description || 'Sí, lleva collar' }
      : pet.has_collar === false
        ? { label: 'Collar', value: 'No llevaba collar' }
        : null,
    pet.event_date
      ? { label: lost ? 'Se perdió el' : 'Lo encontraron el', value: longDate(pet.event_date) }
      : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 flex flex-col gap-8">
      {reunited && (
        <p className="card p-4 bg-reunited-soft border-reunited/30 text-center font-bold text-reunited">
          🎉 Este animalito ya volvió con su familia
        </p>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-8">
        {/* Fotos */}
        <div className="flex flex-col gap-3">
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-surface-soft border border-border">
            {pet.photos[0] ? (
              <Image
                src={photoUrl(pet.photos[0])}
                alt={pet.ai_summary || headline(pet)}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-6xl opacity-40">🐾</div>
            )}
            <div className="absolute top-3 left-3">
              <KindBadge kind={pet.kind} status={pet.status} />
            </div>
          </div>

          {pet.photos.length > 1 && (
            <div className="grid grid-cols-3 gap-3">
              {pet.photos.slice(1).map((path, index) => (
                <div
                  key={path}
                  className="relative aspect-square rounded-xl overflow-hidden border border-border bg-surface-soft"
                >
                  <Image
                    src={photoUrl(path)}
                    alt={`Foto ${index + 2}`}
                    fill
                    sizes="180px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Datos */}
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-balance">
              {headline(pet)}
            </h1>
            <p className="text-ink-soft flex items-center gap-1.5">
              <span aria-hidden>📍</span>
              {pet.neighborhood ? `${pet.neighborhood}, ` : ''}
              {pet.city_name}, {pet.department}
            </p>
            <p className="text-sm text-ink-soft">Publicado {relativeDate(pet.created_at)}</p>
          </header>

          {pet.reward && (
            <p className="card p-3 bg-lost-soft border-lost/30 font-semibold text-lost text-center">
              🎁 {pet.reward}
            </p>
          )}

          {!reunited && (
            <div className="card p-5 flex flex-col gap-3">
              <h2 className="font-bold">
                {lost ? '¿Lo viste? Escribile a su familia' : '¿Es tuyo? Escribile a quien lo tiene'}
              </h2>
              <p className="text-sm text-ink-soft">
                Contacto: <strong className="text-ink">{pet.contact_name}</strong>
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                {pet.contact_whatsapp && (
                  <a
                    href={`https://wa.me/${wa}?text=${encodeURIComponent(
                      `Hola ${pet.contact_name}, te escribo por el aviso de Volvé a Casa.`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-center px-5 py-3 rounded-xl bg-primary text-primary-ink font-bold"
                  >
                    Escribir por WhatsApp
                  </a>
                )}
                <a
                  href={`tel:${pet.contact_phone.replace(/\s/g, '')}`}
                  className="flex-1 text-center px-5 py-3 rounded-xl border border-border bg-surface font-bold hover:border-primary transition-colors"
                >
                  Llamar {pet.contact_phone}
                </a>
              </div>
            </div>
          )}

          <ShareButtons slug={pet.slug} title={headline(pet)} />

          <section className="flex flex-col gap-2">
            <h2 className="font-bold">La historia</h2>
            <p className="text-ink-soft whitespace-pre-line leading-relaxed">{pet.description}</p>
          </section>

          {facts.length > 0 && (
            <section>
              <h2 className="font-bold mb-2">Cómo es</h2>
              <dl className="card divide-y divide-border">
                {facts.map((fact) => (
                  <div key={fact.label} className="flex gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-ink-soft w-36 shrink-0">{fact.label}</dt>
                    <dd className="font-medium">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {pet.marks.length > 0 && (
            <section>
              <h2 className="font-bold mb-2">Señas particulares</h2>
              <ul className="flex flex-wrap gap-2">
                {pet.marks.map((mark) => (
                  <li
                    key={mark}
                    className="text-sm px-3 py-1.5 rounded-full bg-surface-soft text-ink-soft"
                  >
                    {mark}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {similar.length > 0 && (
        <section className="border-t border-border pt-8 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold">
              {lost ? 'Animalitos encontrados en la misma ciudad' : 'Se perdieron en la misma ciudad'}
            </h2>
            <p className="text-ink-soft text-sm">
              Vale la pena mirarlos: a veces la coincidencia está acá mismo.
            </p>
          </div>
          <PetGrid pets={similar} />
        </section>
      )}

      <p className="text-center">
        <Link href="/buscar" className="text-sm font-semibold text-primary">
          ← Seguir buscando
        </Link>
      </p>
    </article>
  );
}
