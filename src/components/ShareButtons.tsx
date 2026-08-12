'use client';

import { useState } from 'react';

/**
 * Compartir es la acción más valiosa de toda la app: un aviso que no circula no
 * encuentra a nadie. Por eso está en primer plano y no escondido en un menú.
 */
export function ShareButtons({ slug, title }: { slug: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/mascota/${slug}` : '';
  const message = `${title} — ayudanos a compartir 🐾`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: message, url });
        return;
      } catch {
        // La persona canceló el diálogo del sistema: no es un error.
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-bold">Compartilo, es lo que más ayuda</h2>
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 min-w-36 text-center px-4 py-2.5 rounded-xl bg-[#25D366] text-white font-bold"
        >
          WhatsApp
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 min-w-28 text-center px-4 py-2.5 rounded-xl border border-border bg-surface font-bold hover:border-primary transition-colors"
        >
          Facebook
        </a>
        <button
          type="button"
          onClick={share}
          className="flex-1 min-w-28 px-4 py-2.5 rounded-xl border border-border bg-surface font-bold hover:border-primary transition-colors"
        >
          {copied ? '¡Link copiado!' : 'Copiar link'}
        </button>
      </div>
    </div>
  );
}
