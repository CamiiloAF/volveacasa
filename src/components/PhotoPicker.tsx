'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import { shrinkImage } from '@/lib/resize';

const MAX = 4;

export function PhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);

  // Las miniaturas se derivan de los archivos, no son estado aparte. El efecto
  // solo libera las URLs cuando cambian, para no dejar los blobs en memoria.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setWorking(true);
    try {
      const room = MAX - files.length;
      const incoming = Array.from(list).slice(0, room);
      const shrunk = await Promise.all(incoming.map((file) => shrinkImage(file)));
      onChange([...files, ...shrunk]);
    } finally {
      setWorking(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <span className="field-label">
        Fotos <span className="font-normal">— hasta {MAX}, la primera es la portada</span>
      </span>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {previews.map((url, index) => (
          <div key={url} className="relative aspect-square rounded-xl overflow-hidden border border-border">
            <Image src={url} alt={`Foto ${index + 1}`} fill className="object-cover" unoptimized />
            {index === 0 && (
              <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-primary text-primary-ink px-1.5 py-0.5 rounded">
                Portada
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(files.filter((_, i) => i !== index))}
              aria-label={`Quitar foto ${index + 1}`}
              className="absolute top-1 right-1 w-7 h-7 grid place-items-center rounded-full bg-black/60 text-white text-sm"
            >
              ✕
            </button>
          </div>
        ))}

        {files.length < MAX && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={working}
            className="aspect-square rounded-xl border-2 border-dashed border-border grid place-items-center gap-1 text-ink-soft hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            <span className="text-2xl" aria-hidden>
              {working ? '⏳' : '📷'}
            </span>
            <span className="text-xs font-semibold">
              {working ? 'Procesando…' : 'Agregar foto'}
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => void add(e.target.files)}
      />

      <p className="text-xs text-ink-soft mt-2">
        Entre más clara se le vea la cara y el cuerpo, mejor la reconoce la IA y las personas.
      </p>
    </div>
  );
}
