'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

import { shrinkImage } from '@/lib/resize';
import { photoUrl } from '@/lib/supabase';

const MAX = 4;

/**
 * Editar las fotos de un aviso ya publicado.
 *
 * Mucha gente publica con afán y sube una foto borrosa, de espaldas o donde el
 * animalito casi no se ve. Poder cambiarla después importa: la foto es lo que
 * hace que alguien se detenga a mirar cuando el aviso pasa por un grupo.
 */
export function PhotoEditor({
  token,
  photos,
  onChange,
}: {
  token: string;
  photos: string[];
  onChange: (photos: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function enviar(form: FormData, mensaje: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/gestionar/${token}/fotos`, {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'No se pudo guardar.');
        return;
      }
      onChange(data.photos as string[]);
      setNotice(mensaje);
    } catch {
      setError('Se cayó la conexión. Intentá otra vez.');
    } finally {
      setBusy(false);
    }
  }

  async function agregar(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const room = MAX - photos.length;
      const incoming = Array.from(list).slice(0, room);
      const shrunk = await Promise.all(incoming.map((file) => shrinkImage(file)));
      const form = new FormData();
      form.append('accion', 'agregar');
      shrunk.forEach((file) => form.append('fotos', file));
      await enviar(form, 'Foto agregada. Si querés, volvé a analizarlas para actualizar las señas.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
      setBusy(false);
    }
  }

  function accionSimple(accion: 'quitar' | 'portada', ruta: string, mensaje: string) {
    const form = new FormData();
    form.append('accion', accion);
    form.append('ruta', ruta);
    return enviar(form, mensaje);
  }

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-bold">Fotos</h2>
        <p className="text-sm text-ink-soft">
          La primera es la portada: es la que se ve al compartir el aviso por WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {photos.map((path, index) => (
          <div
            key={path}
            className="relative aspect-square rounded-xl overflow-hidden border border-border bg-surface-soft"
          >
            <Image
              src={photoUrl(path)}
              alt={`Foto ${index + 1}`}
              fill
              sizes="180px"
              className="object-cover"
            />

            {index === 0 ? (
              <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-primary text-primary-ink px-1.5 py-0.5 rounded">
                Portada
              </span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void accionSimple('portada', path, 'Listo, esa es la portada.')}
                className="absolute bottom-1 left-1 text-[10px] font-bold bg-black/70 text-white px-1.5 py-0.5 rounded disabled:opacity-50"
              >
                Hacer portada
              </button>
            )}

            {photos.length > 1 && (
              <button
                type="button"
                disabled={busy}
                aria-label={`Quitar foto ${index + 1}`}
                onClick={() => {
                  if (!confirm('¿Quitar esta foto del aviso?')) return;
                  void accionSimple('quitar', path, 'Foto quitada.');
                }}
                className="absolute top-1 right-1 w-7 h-7 grid place-items-center rounded-full bg-black/60 text-white text-sm disabled:opacity-50"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {photos.length < MAX && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-border grid place-items-center gap-1 text-ink-soft hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            <span className="text-2xl" aria-hidden>
              {busy ? '⏳' : '📷'}
            </span>
            <span className="text-xs font-semibold">{busy ? 'Subiendo…' : 'Agregar foto'}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => void agregar(e.target.files)}
      />

      {notice && <p className="text-sm text-primary font-semibold">{notice}</p>}
      {error && <p className="text-sm text-lost font-semibold">{error}</p>}

      {photos.length === 1 && (
        <p className="text-xs text-ink-soft">
          Para quitar esta foto tenés que agregar otra primero: un aviso sin foto casi no se
          encuentra.
        </p>
      )}
    </div>
  );
}
