import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import { siteUrlObject } from '@/lib/site';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: siteUrlObject(),
  title: {
    default: 'Volvé a Casa — mascotas perdidas y encontradas en Colombia',
    template: '%s · Volvé a Casa',
  },
  description:
    'Publicá y buscá mascotas perdidas y encontradas en Colombia. Gratis, sin cuenta y en menos de un minuto.',
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    siteName: 'Volvé a Casa',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf7f0' },
    { media: '(prefers-color-scheme: dark)', color: '#12181a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="min-h-dvh flex flex-col">
        <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
              <span
                aria-hidden
                className="grid place-items-center w-9 h-9 rounded-xl bg-primary text-primary-ink text-lg"
              >
                🐾
              </span>
              <span>
                Volvé a <span className="text-primary">Casa</span>
              </span>
            </Link>

            <nav className="flex items-center gap-2 text-sm">
              <Link
                href="/buscar"
                className="px-3 py-2 rounded-lg font-medium hover:bg-surface-soft transition-colors"
              >
                Buscar
              </Link>
              <Link
                href="/mis-avisos"
                className="hidden sm:inline-block px-3 py-2 rounded-lg font-medium hover:bg-surface-soft transition-colors"
              >
                Mis avisos
              </Link>
              <Link
                href="/publicar"
                className="px-4 py-2 rounded-lg bg-primary text-primary-ink font-semibold hover:opacity-90 transition-opacity"
              >
                Publicar
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border mt-16">
          <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-soft flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <p>
              Hecho para ayudar a que más animalitos vuelvan a casa. Gratis y sin cuenta.
            </p>
            <p className="flex gap-4">
              <Link href="/buscar" className="hover:text-ink transition-colors">
                Buscar
              </Link>
              <Link href="/publicar" className="hover:text-ink transition-colors">
                Publicar
              </Link>
              <Link href="/mis-avisos" className="hover:text-ink transition-colors">
                Mis avisos
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
