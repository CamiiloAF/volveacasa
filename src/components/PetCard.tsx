import Image from 'next/image';
import Link from 'next/link';

import { photoUrl } from '@/lib/supabase';
import { relativeDate } from '@/lib/text';
import { COLOR_LABEL, SIZE_LABEL, type Color, type PetCard as PetCardType } from '@/lib/types';

export function KindBadge({ kind, status }: { kind: string; status?: string }) {
  if (status === 'reunido') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-reunited-soft text-reunited px-2.5 py-1 text-xs font-bold">
        🎉 Ya está en casa
      </span>
    );
  }
  const lost = kind === 'perdido';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
        lost ? 'bg-lost-soft text-lost' : 'bg-found-soft text-found'
      }`}
    >
      {lost ? 'Se perdió' : 'Lo encontraron'}
    </span>
  );
}

export function PetCard({ pet }: { pet: PetCardType }) {
  const cover = pet.photos[0] ? photoUrl(pet.photos[0]) : null;
  const title = pet.name?.trim() || (pet.kind === 'perdido' ? 'Sin nombre' : 'Sin identificar');

  return (
    <Link
      href={`/mascota/${pet.slug}`}
      className="card overflow-hidden group flex flex-col hover:border-primary transition-colors"
    >
      <div className="relative aspect-[4/3] bg-surface-soft overflow-hidden">
        {cover ? (
          <Image
            src={cover}
            alt={pet.ai_summary || `Foto de ${title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
            className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-4xl opacity-40">🐾</div>
        )}
        <div className="absolute top-2.5 left-2.5">
          <KindBadge kind={pet.kind} status={pet.status} />
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-bold text-base leading-tight truncate">{title}</h3>
          <span className="text-xs text-ink-soft shrink-0">{relativeDate(pet.created_at)}</span>
        </div>

        <p className="text-sm text-ink-soft line-clamp-2 flex-1">
          {pet.ai_summary || pet.description}
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {pet.colors.slice(0, 3).map((color) => (
            <span
              key={color}
              className="text-xs px-2 py-0.5 rounded-md bg-surface-soft text-ink-soft"
            >
              {COLOR_LABEL[color as Color] ?? color}
            </span>
          ))}
          {pet.size && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-surface-soft text-ink-soft">
              {SIZE_LABEL[pet.size]}
            </span>
          )}
        </div>

        <p className="text-sm font-medium text-ink-soft flex items-center gap-1 pt-0.5">
          <span aria-hidden>📍</span>
          <span className="truncate">
            {pet.neighborhood ? `${pet.neighborhood}, ` : ''}
            {pet.city_name}
          </span>
        </p>
      </div>
    </Link>
  );
}

export function PetGrid({ pets }: { pets: PetCardType[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {pets.map((pet) => (
        <PetCard key={pet.id} pet={pet} />
      ))}
    </div>
  );
}
