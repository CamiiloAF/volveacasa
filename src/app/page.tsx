import Link from 'next/link';

import { PetGrid } from '@/components/PetCard';
import { browsePets, petStats } from '@/lib/pets';

export const revalidate = 60;

export default async function HomePage() {
  const [recent, reunited, stats] = await Promise.all([
    browsePets({ limit: 8 }).catch(() => []),
    browsePets({ status: 'reunido', limit: 4 }).catch(() => []),
    petStats().catch(() => ({ activos: 0, reunidos: 0, ciudades: 0 })),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="py-14 sm:py-20 text-center flex flex-col items-center gap-6">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight max-w-3xl text-balance">
          Ayudemos a que vuelvan <span className="text-primary">a casa</span>
        </h1>
        <p className="text-lg text-ink-soft max-w-2xl text-pretty">
          Publicá o buscá mascotas perdidas y encontradas en cualquier municipio de Colombia.
          Gratis, sin crear cuenta y en menos de un minuto.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link
            href="/publicar"
            className="px-6 py-3.5 rounded-xl bg-primary text-primary-ink font-bold text-center"
          >
            Publicar un aviso
          </Link>
          <Link
            href="/buscar"
            className="px-6 py-3.5 rounded-xl border border-border bg-surface font-bold text-center hover:border-primary transition-colors"
          >
            Buscar con IA
          </Link>
        </div>

        {stats.activos + stats.reunidos > 0 && (
          <dl className="flex flex-wrap justify-center gap-x-8 gap-y-3 pt-4 text-sm">
            <Stat value={stats.activos} label="avisos activos" />
            <Stat value={stats.reunidos} label="ya volvieron a casa" />
            <Stat value={stats.ciudades} label="municipios" />
          </dl>
        )}
      </section>

      {/* Cómo funciona */}
      <section className="grid gap-4 sm:grid-cols-3 pb-14">
        <Step
          icon="📸"
          title="Subís la foto"
          body="La IA mira la foto y describe sola el color, el tamaño y las señas particulares."
        />
        <Step
          icon="💬"
          title="Buscás con tus palabras"
          body="Escribí “gato negro con mancha blanca en la cara” y encontramos lo que se le parezca."
        />
        <Step
          icon="🔗"
          title="Compartís el link"
          body="Cada aviso tiene su propia página con foto, lista para mandar por WhatsApp."
        />
      </section>

      {/* Reencuentros */}
      {reunited.length > 0 && (
        <section className="pb-14">
          <h2 className="text-xl font-bold mb-1">Volvieron a casa 🎉</h2>
          <p className="text-ink-soft text-sm mb-5">
            Cada uno de estos es una familia completa otra vez.
          </p>
          <PetGrid pets={reunited} />
        </section>
      )}

      {/* Recientes */}
      <section className="pb-8">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="text-xl font-bold">Publicados hace poco</h2>
          <Link href="/buscar" className="text-sm font-semibold text-primary shrink-0">
            Ver todos →
          </Link>
        </div>

        {recent.length > 0 ? (
          <PetGrid pets={recent} />
        ) : (
          <div className="card p-10 text-center flex flex-col items-center gap-3">
            <span className="text-4xl" aria-hidden>
              🐾
            </span>
            <h3 className="font-bold text-lg">Todavía no hay avisos</h3>
            <p className="text-ink-soft max-w-md">
              Sé la primera persona en publicar. Entre más avisos haya, más fácil es que alguien
              reconozca a un animalito y avise.
            </p>
            <Link
              href="/publicar"
              className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-ink font-bold"
            >
              Publicar el primero
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold text-primary">{value}</span>
        <span className="text-ink-soft">{label}</span>
      </dd>
    </div>
  );
}

function Step({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card p-5 flex flex-col gap-2">
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-ink-soft">{body}</p>
    </div>
  );
}
