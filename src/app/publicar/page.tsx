import type { Metadata } from 'next';

import { PublishForm } from '@/components/PublishForm';

export const metadata: Metadata = {
  title: 'Publicar un aviso',
  description:
    'Publicá gratis y sin cuenta un aviso de mascota perdida o encontrada en cualquier municipio de Colombia.',
};

export default function PublishPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Publicar un aviso</h1>
        <p className="text-ink-soft">
          No necesitás crear cuenta. Toma menos de un minuto y al final te damos un link para
          editarlo o marcar que ya apareció.
        </p>
      </header>

      <PublishForm />
    </div>
  );
}
