import Image from 'next/image';
import Link from 'next/link';

import { matchLabel, type PetMatch } from '@/lib/match-shared';
import { photoUrl } from '@/lib/supabase';
import { relativeDate } from '@/lib/text';

/**
 * Coincidencias que la IA encontró entre un aviso y los del tipo contrario.
 *
 * Se muestra la razón en palabras y nunca un porcentaje: "87% de coincidencia"
 * suena a certeza y acá no la hay. Quien decide si es su mascota es la familia
 * mirando la foto, no el modelo.
 */
export function MatchList({ matches, ownKind }: { matches: PetMatch[]; ownKind: string }) {
  if (matches.length === 0) return null;

  const buscandoDueno = ownKind === 'perdido';

  return (
    <section className="card p-5 border-primary/40 bg-primary-soft/40 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span aria-hidden>✨</span>
          {matches.length === 1
            ? 'Encontramos un aviso que se parece'
            : `Encontramos ${matches.length} avisos que se parecen`}
        </h2>
        <p className="text-sm text-ink-soft mt-1">
          {buscandoDueno
            ? 'Alguien reportó haber encontrado un animalito con estas características cerca. Mirá las fotos con calma.'
            : 'Alguien está buscando un animalito con estas características cerca. Mirá las fotos con calma.'}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {matches.map((match) => (
          <li key={match.id}>
            <Link
              href={`/mascota/${match.slug}`}
              className="card p-3 flex gap-3 items-start hover:border-primary transition-colors"
            >
              <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-surface-soft">
                {match.photos[0] ? (
                  <Image
                    src={photoUrl(match.photos[0])}
                    alt={match.ai_summary ?? 'Foto del animalito'}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-2xl opacity-40">
                    🐾
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary text-primary-ink">
                    {matchLabel(match.score)}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {match.neighborhood ? `${match.neighborhood}, ` : ''}
                    {match.city_name} · {relativeDate(match.created_at)}
                  </span>
                </div>

                <p className="font-semibold text-sm">
                  {match.name?.trim() || match.ai_summary || 'Ver el aviso'}
                </p>

                {/* Por qué la IA cree que se parecen, en palabras de la familia. */}
                <p className="text-sm text-ink-soft">{match.reason}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-soft">
        Esto lo sugiere la IA comparando las descripciones y puede equivocarse. Confirmá siempre
        mirando las fotos y hablando con la otra persona antes de ilusionarte.
      </p>
    </section>
  );
}
