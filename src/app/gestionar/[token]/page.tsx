import type { Metadata } from 'next';

import { ManagePanel } from '@/components/ManagePanel';

// El token va en la URL: que ningún buscador lo indexe.
export const metadata: Metadata = {
  title: 'Gestionar mi aviso',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Gestionar mi aviso</h1>
        <p className="text-ink-soft">
          Este link es tu llave: guardalo. Con él editás el aviso o marcás que ya apareció.
        </p>
      </header>

      <ManagePanel token={token} />
    </div>
  );
}
