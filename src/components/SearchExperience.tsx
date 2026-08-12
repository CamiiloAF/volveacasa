'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import { cityLabel } from '@/lib/cities';
import { COLOR_LABEL, SIZE_LABEL, type Color, type PetCard as PetCardType } from '@/lib/types';
import { CityPicker } from './CityPicker';
import { PetGrid } from './PetCard';

const EXAMPLES = [
  'gato negro con mancha blanca en la cara',
  'perro criollo café mediano en Medellín',
  'perrita pequeña con collar rojo',
  'gato atigrado de ojos verdes',
];

type Intent = {
  species: string | null;
  colors: string[];
  size: string | null;
  keywords: string[];
  resolvedCityCode: string | null;
  resolvedDepartment: string | null;
};

type Response = {
  results?: PetCardType[];
  intent?: Intent;
  usedAi?: boolean;
  error?: string;
};

export function SearchExperience({
  initialQuery = '',
  initialResults = null,
  initialIntent = null,
}: {
  initialQuery?: string;
  /** Resultados ya calculados en el servidor cuando se abre un link compartido. */
  initialResults?: PetCardType[] | null;
  initialIntent?: Intent | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [cityCode, setCityCode] = useState<string | null>(params.get('ciudad'));
  // Un link compartido llega con los resultados ya resueltos en el servidor:
  // se ven de una, sin parpadeo de carga y sin depender de JavaScript.
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    initialResults ? 'done' : 'idle',
  );
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<PetCardType[]>(initialResults ?? []);
  const [intent, setIntent] = useState<Intent | null>(initialIntent);
  const requestId = useRef(0);

  /** Dispara la búsqueda. Quien la llama ya dejó el estado en "loading". */
  const run = useCallback(
    async (text: string, city: string | null) => {
      if (text.trim().length < 2) return;
      const id = ++requestId.current;

      try {
        const response = await fetch('/api/buscar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: text, cityCode: city, status: 'activo' }),
        });
        const data: Response = await response.json();
        if (id !== requestId.current) return;

        if (!response.ok) {
          setStatus('error');
          setMessage(data.error ?? 'No se pudo buscar.');
          return;
        }
        setResults(data.results ?? []);
        setIntent(data.intent ?? null);
        setStatus('done');
      } catch {
        if (id !== requestId.current) return;
        setStatus('error');
        setMessage('Se cayó la conexión. Intentá otra vez.');
      }
    },
    [],
  );

  /** Punto único de entrada desde la interfaz: marca "loading" y lanza. */
  function start(text: string, city: string | null) {
    setStatus('loading');
    setMessage('');
    void run(text, city);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    if (cityCode) next.set('ciudad', cityCode);
    router.replace(`/buscar?${next.toString()}`, { scroll: false });
    start(query, cityCode);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="card p-4 sm:p-5 flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="q">
            Describí al animalito como lo recordás
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="q"
              name="q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Un gato negro con una mancha blanca en la cara…"
              className="field flex-1"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={status === 'loading' || query.trim().length < 2}
              className="px-6 py-3 rounded-xl bg-primary text-primary-ink font-bold disabled:opacity-50 transition-opacity"
            >
              {status === 'loading' ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <CityPicker
            value={cityCode}
            onChange={setCityCode}
            label="Filtrar por ciudad (opcional)"
          />
        </div>

        {status === 'idle' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-sm text-ink-soft self-center">Probá con:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuery(example);
                  start(example, cityCode);
                }}
                className="text-sm px-3 py-1.5 rounded-full bg-surface-soft hover:bg-primary-soft transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </form>

      {status === 'error' && (
        <p className="card p-4 text-lost bg-lost-soft border-lost/30">{message}</p>
      )}

      {status === 'done' && intent && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-soft">Entendí que buscás:</span>
          {intent.species && <Chip>{intent.species}</Chip>}
          {intent.colors.map((color) => (
            <Chip key={color}>{COLOR_LABEL[color as Color] ?? color}</Chip>
          ))}
          {intent.size && <Chip>{SIZE_LABEL[intent.size as 'pequeno'] ?? intent.size}</Chip>}
          {intent.keywords.slice(0, 5).map((word) => (
            <Chip key={word}>{word}</Chip>
          ))}
          {intent.resolvedCityCode && <Chip>📍 {cityLabel(intent.resolvedCityCode)}</Chip>}
          {intent.resolvedDepartment && <Chip>📍 {intent.resolvedDepartment}</Chip>}
        </div>
      )}

      {status === 'loading' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-surface-soft" />
              <div className="p-4 flex flex-col gap-2">
                <div className="h-4 bg-surface-soft rounded w-2/3" />
                <div className="h-3 bg-surface-soft rounded" />
                <div className="h-3 bg-surface-soft rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'done' && results.length > 0 && (
        <div className="fade-up flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            {results.length === 1
              ? '1 posible coincidencia, la más parecida primero.'
              : `${results.length} posibles coincidencias, las más parecidas primero.`}
          </p>
          <PetGrid pets={results} />
        </div>
      )}

      {status === 'done' && results.length === 0 && (
        <div className="card p-8 text-center flex flex-col items-center gap-3">
          <span className="text-4xl" aria-hidden>
            🔎
          </span>
          <h2 className="font-bold text-lg">Todavía no hay nada que se parezca</h2>
          <p className="text-ink-soft max-w-md">
            Eso no significa que no vaya a aparecer. Publicá el aviso para que quien lo encuentre
            pueda dar contigo, y volvé a buscar en un par de días.
          </p>
          <a
            href="/publicar"
            className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-ink font-bold"
          >
            Publicar un aviso
          </a>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 rounded-full bg-primary-soft text-primary text-xs font-semibold">
      {children}
    </span>
  );
}
