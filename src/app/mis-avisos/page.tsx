import type { Metadata } from 'next';

import { MyListings } from '@/components/MyListings';

export const metadata: Metadata = {
  title: 'Mis avisos',
  description: 'Los avisos que publicaste desde este dispositivo.',
  robots: { index: false, follow: false },
};

export default function MyListingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Mis avisos</h1>
        <p className="text-ink-soft">
          Los avisos que publicaste desde este navegador, con su link de gestión a la mano. Todo
          esto se guarda solo en tu dispositivo: nunca viaja a nuestros servidores.
        </p>
      </header>

      <MyListings />
    </div>
  );
}
