'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import {
  forgetListing,
  readSavedListings,
  serverSnapshot,
  subscribeToSavedListings,
} from '@/lib/misavisos';
import { relativeDate } from '@/lib/text';

export function MyListings() {
  // useSyncExternalStore es la forma que React da para leer algo que vive
  // fuera de React (acá, localStorage) sin desincronizar el HTML del servidor
  // con lo que ve el navegador. En el servidor devuelve null y mostramos el
  // esqueleto; al hidratar aparece la lista real.
  const listings = useSyncExternalStore(
    subscribeToSavedListings,
    readSavedListings,
    serverSnapshot,
  );

  if (listings === null) {
    return <div className="card h-32 animate-pulse" />;
  }

  if (listings.length === 0) {
    return (
      <div className="card p-8 text-center flex flex-col items-center gap-3">
        <span className="text-4xl" aria-hidden>
          🔎
        </span>
        <h2 className="font-bold text-lg">Este dispositivo no tiene avisos guardados</h2>
        <p className="text-ink-soft max-w-md">
          Acá aparecen los avisos que publicaste desde este mismo navegador. Si publicaste desde
          otro celular, o borraste los datos del navegador, vas a necesitar el link de gestión que
          te dimos al publicar — buscalo en tus mensajes de WhatsApp.
        </p>
        <Link
          href="/publicar"
          className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-ink font-bold"
        >
          Publicar un aviso
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {listings.map((listing) => (
        <li key={listing.slug} className="card p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-40">
            <p className="font-bold">{listing.label}</p>
            <p className="text-sm text-ink-soft">Publicado {relativeDate(listing.savedAt)}</p>
          </div>

          <Link
            href={`/mascota/${listing.slug}`}
            className="px-4 py-2 rounded-xl border border-border bg-surface font-semibold text-sm hover:border-primary transition-colors"
          >
            Ver aviso
          </Link>
          <Link
            href={`/gestionar/${listing.token}`}
            className="px-4 py-2 rounded-xl bg-primary text-primary-ink font-bold text-sm"
          >
            Gestionar
          </Link>
          <button
            type="button"
            aria-label={`Quitar ${listing.label} de este dispositivo`}
            title="Quitar de esta lista (no borra el aviso)"
            onClick={() => forgetListing(listing.slug)}
            className="px-2 py-2 text-ink-soft hover:text-lost transition-colors"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
