'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { cityByCode, searchCities, type City } from '@/lib/cities';

type Props = {
  value: string | null;
  onChange: (code: string | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
};

/**
 * Selector de municipio sobre los 1.122 del DANE. Es un combobox y no un
 * `<select>` gigante porque en celular una lista de mil opciones es inusable:
 * acá se escriben tres letras y aparece el municipio.
 */
export function CityPicker({
  value,
  onChange,
  label = 'Ciudad',
  placeholder = 'Escribí tu municipio…',
  required,
}: Props) {
  const id = useId();
  const selected = useMemo(() => cityByCode(value), [value]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const options = useMemo<City[]>(() => (query.trim() ? searchCities(query, 8) : []), [query]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pick(city: City) {
    onChange(city.c);
    setQuery('');
    setOpen(false);
  }

  if (selected) {
    return (
      <div>
        <label className="field-label">{label}</label>
        <div className="flex items-center gap-2 field">
          <span aria-hidden>📍</span>
          <span className="flex-1 truncate font-medium">
            {selected.n}
            <span className="text-ink-soft font-normal">, {selected.d}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
            className="text-sm text-primary font-semibold shrink-0 px-1"
          >
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="field"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        required={required && !value}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!options.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % options.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i - 1 + options.length) % options.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />

      {open && options.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-40 mt-1 w-full card overflow-hidden shadow-lg max-h-72 overflow-y-auto"
        >
          {options.map((city, index) => (
            <li key={city.c}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(city)}
                className={`w-full text-left px-3.5 py-2.5 text-sm ${
                  index === active ? 'bg-primary-soft' : ''
                }`}
              >
                <span className="font-medium">{city.n}</span>
                <span className="text-ink-soft">, {city.d}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim().length >= 2 && options.length === 0 && (
        <p className="absolute z-40 mt-1 w-full card px-3.5 py-2.5 text-sm text-ink-soft">
          No encontramos ese municipio.
        </p>
      )}
    </div>
  );
}
