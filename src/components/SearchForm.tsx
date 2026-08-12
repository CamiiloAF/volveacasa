'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { CityPicker } from '@/components/CityPicker';
import { filtersToQuery, hasAnyFilter, type Filters } from '@/lib/filters';
import {
  COLORS,
  COLOR_LABEL,
  KINDS,
  SIZES,
  SIZE_LABEL,
  SPECIES,
  SPECIES_LABEL,
  type Color,
  type Kind,
  type Sex,
  type Size,
  type Species,
} from '@/lib/types';

const EJEMPLOS = [
  'gato negro con mancha blanca en la cara',
  'perro criollo café mediano',
  'perrita pequeña con collar rojo',
];

/**
 * Las dos maneras de buscar, en un solo formulario.
 *
 * Los filtros son los que casi todo el mundo va a usar: tocar "gato" y su
 * ciudad es más rápido que redactar, sobre todo desde el celular y con afán.
 * El texto libre está para las señas particulares, que es lo que ningún
 * selector puede capturar ("con una mancha blanca en la oreja izquierda").
 *
 * Los filtros no gastan cupo de IA. El texto libre sí, y solo si se escribe.
 */
export function SearchForm({ filters: initial }: { filters: Filters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(initial.q);
  const [kind, setKind] = useState<Kind | null>(initial.kind);
  const [species, setSpecies] = useState<Species | null>(initial.species);
  const [cityCode, setCityCode] = useState<string | null>(initial.cityCode);
  const [size, setSize] = useState<Size | null>(initial.size);
  const [sex, setSex] = useState<Sex | null>(initial.sex);
  const [colors, setColors] = useState<Color[]>(initial.colors);
  const [breed, setBreed] = useState(initial.breed);
  const [status, setStatus] = useState<'activo' | 'reunido'>(initial.status);
  const [abierto, setAbierto] = useState(
    Boolean(initial.size || initial.sex || initial.colors.length || initial.breed),
  );

  const actuales: Filters = { q, kind, species, cityCode, size, sex, colors, breed, status };

  function buscar(next: Filters = actuales) {
    const query = filtersToQuery(next);
    startTransition(() => router.push(query ? `/buscar?${query}` : '/buscar'));
  }

  function limpiar() {
    setQ('');
    setKind(null);
    setSpecies(null);
    setCityCode(null);
    setSize(null);
    setSex(null);
    setColors([]);
    setBreed('');
    setStatus('activo');
    startTransition(() => router.push('/buscar'));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        buscar();
      }}
      className="card p-4 sm:p-5 flex flex-col gap-5"
    >
      {/* Filtros rápidos: lo que casi todos van a usar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Grupo label="Estoy buscando">
            <Chip activo={kind === null} onClick={() => setKind(null)}>
              Todos
            </Chip>
            {KINDS.map((k) => (
              <Chip key={k} activo={kind === k} onClick={() => setKind(k)}>
                {k === 'perdido' ? 'Perdidos' : 'Encontrados'}
              </Chip>
            ))}
          </Grupo>

          <Grupo label="Animal">
            <Chip activo={species === null} onClick={() => setSpecies(null)}>
              Todos
            </Chip>
            {SPECIES.map((s) => (
              <Chip key={s} activo={species === s} onClick={() => setSpecies(s)}>
                {SPECIES_LABEL[s]}
              </Chip>
            ))}
          </Grupo>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <CityPicker value={cityCode} onChange={setCityCode} label="Ciudad" />
          <div>
            <label className="field-label" htmlFor="raza">
              Raza o palabra clave
            </label>
            <input
              id="raza"
              className="field"
              value={breed}
              maxLength={60}
              onChange={(e) => setBreed(e.target.value)}
              placeholder="criollo, pastor, collar rojo…"
            />
          </div>
        </div>
      </div>

      {/* Más filtros */}
      <div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="text-sm font-semibold text-primary"
          aria-expanded={abierto}
        >
          {abierto ? '− Menos filtros' : '+ Más filtros (color, tamaño, sexo)'}
        </button>

        {abierto && (
          <div className="mt-3 flex flex-col gap-3 rounded-xl bg-surface-soft p-4">
            <div>
              <span className="field-label">Colores</span>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((color) => {
                  const on = colors.includes(color);
                  return (
                    <Chip
                      key={color}
                      activo={on}
                      onClick={() =>
                        setColors((current) =>
                          on ? current.filter((c) => c !== color) : [...current, color].slice(0, 4),
                        )
                      }
                    >
                      {COLOR_LABEL[color]}
                    </Chip>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="field-label" htmlFor="f-tamano">
                  Tamaño
                </label>
                <select
                  id="f-tamano"
                  className="field"
                  value={size ?? ''}
                  onChange={(e) => setSize((e.target.value || null) as Size | null)}
                >
                  <option value="">Cualquiera</option>
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {SIZE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="f-sexo">
                  Sexo
                </label>
                <select
                  id="f-sexo"
                  className="field"
                  value={sex ?? ''}
                  onChange={(e) => setSex((e.target.value || null) as Sex | null)}
                >
                  <option value="">Cualquiera</option>
                  <option value="macho">Macho</option>
                  <option value="hembra">Hembra</option>
                </select>
              </div>

              <p className="text-xs text-ink-soft sm:col-span-3 -mb-1">
                El tamaño y el sexo ordenan los resultados pero no los descartan: quien recogió al
                animalito en la calle casi nunca sabe el sexo, y &quot;mediano&quot; para una
                persona es &quot;grande&quot; para otra.
              </p>

              <div>
                <label className="field-label" htmlFor="f-estado">
                  Estado
                </label>
                <select
                  id="f-estado"
                  className="field"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'activo' | 'reunido')}
                >
                  <option value="activo">Todavía buscando</option>
                  <option value="reunido">Ya volvieron a casa</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Texto libre: lo único que gasta IA, y solo si se escribe */}
      <div className="border-t border-border pt-4">
        <label className="field-label" htmlFor="q">
          ¿Tiene alguna seña particular? <span className="font-normal">(opcional)</span>
        </label>
        <input
          id="q"
          type="search"
          className="field"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Una mancha blanca en el pecho, la oreja izquierda caída…"
          autoComplete="off"
        />
        <p className="text-xs text-ink-soft mt-1.5">
          Escribilo como lo recordás. Esto lo interpreta la IA; los filtros de arriba funcionan
          igual sin ella.
        </p>

        {!hasAnyFilter(actuales) && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-sm text-ink-soft self-center">Probá con:</span>
            {EJEMPLOS.map((ejemplo) => (
              <button
                key={ejemplo}
                type="button"
                onClick={() => {
                  setQ(ejemplo);
                  buscar({ ...actuales, q: ejemplo });
                }}
                className="text-sm px-3 py-1.5 rounded-full bg-surface-soft hover:bg-primary-soft transition-colors"
              >
                {ejemplo}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 px-6 py-3 rounded-xl bg-primary text-primary-ink font-bold disabled:opacity-60"
        >
          {pending ? 'Buscando…' : 'Buscar'}
        </button>
        {hasAnyFilter(initial) && (
          <button
            type="button"
            onClick={limpiar}
            className="px-5 py-3 rounded-xl border border-border bg-surface font-semibold"
          >
            Limpiar
          </button>
        )}
      </div>
    </form>
  );
}

function Grupo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="field-label mb-0">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
        activo
          ? 'bg-primary text-primary-ink border-primary'
          : 'bg-surface border-border hover:border-primary'
      }`}
    >
      {children}
    </button>
  );
}
