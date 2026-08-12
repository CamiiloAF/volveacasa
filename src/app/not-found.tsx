import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center flex flex-col items-center gap-4">
      <span className="text-5xl" aria-hidden>
        🐾
      </span>
      <h1 className="text-2xl font-extrabold">No encontramos esta página</h1>
      <p className="text-ink-soft">
        Puede que el aviso se haya eliminado o que el link esté incompleto.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Link href="/buscar" className="px-5 py-3 rounded-xl bg-primary text-primary-ink font-bold">
          Buscar una mascota
        </Link>
        <Link
          href="/"
          className="px-5 py-3 rounded-xl border border-border bg-surface font-bold hover:border-primary transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
