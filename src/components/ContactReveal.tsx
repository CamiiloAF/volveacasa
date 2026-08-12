'use client';

import { useState } from 'react';

type Contact = { name: string; phone: string; whatsapp: boolean; waNumber: string | null };

/**
 * El teléfono no viaja en el HTML del aviso: se pide al tocar el botón.
 *
 * Una persona que quiere avisar que vio al animalito da un clic más. Quien
 * quiera llevarse todos los números del sitio ya no puede hacerlo recorriendo
 * el sitemap: necesita una petición por aviso, y el servidor las cuenta por IP.
 */
export function ContactReveal({ slug, contactName }: { slug: string; contactName: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function reveal() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/contacto/${slug}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'No pudimos cargar el contacto.');
        return;
      }
      setContact(data as Contact);
    } catch {
      setError('Se cayó la conexión. Intentá otra vez.');
    } finally {
      setLoading(false);
    }
  }

  if (!contact) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={reveal}
          disabled={loading}
          className="px-5 py-3 rounded-xl bg-primary text-primary-ink font-bold disabled:opacity-60"
        >
          {loading ? 'Cargando…' : `📞 Ver cómo contactar a ${contactName}`}
        </button>
        {error && <p className="text-sm text-lost font-medium">{error}</p>}
        <p className="text-xs text-ink-soft">
          Mostramos el teléfono solo cuando alguien lo pide, para que no se puedan recolectar en
          masa los números de quienes publican.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 fade-up">
      {contact.whatsapp && contact.waNumber && (
        <a
          href={`https://wa.me/${contact.waNumber}?text=${encodeURIComponent(
            `Hola ${contact.name}, te escribo por el aviso de Volvé a Casa.`,
          )}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1 text-center px-5 py-3 rounded-xl bg-primary text-primary-ink font-bold"
        >
          Escribir por WhatsApp
        </a>
      )}
      <a
        href={`tel:${contact.phone.replace(/\s/g, '')}`}
        className="flex-1 text-center px-5 py-3 rounded-xl border border-border bg-surface font-bold hover:border-primary transition-colors"
      >
        Llamar {contact.phone}
      </a>
    </div>
  );
}
