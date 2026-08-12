'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CityPicker } from '@/components/CityPicker';
import { COLORS, COLOR_LABEL, SIZES, SIZE_LABEL, type Color, type Pet, type Size } from '@/lib/types';

type State =
  | { phase: 'loading' }
  /** El código no corresponde a ningún aviso. */
  | { phase: 'missing' }
  /** No pudimos preguntar. Distinto de 'missing': el aviso probablemente sigue ahí. */
  | { phase: 'unavailable' }
  | { phase: 'ready'; pet: Pet }
  | { phase: 'deleted' };

export function ManagePanel({ token }: { token: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Campos editables
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [cityCode, setCityCode] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState(true);
  const [reward, setReward] = useState('');
  const [colors, setColors] = useState<Color[]>([]);
  const [size, setSize] = useState<Size | ''>('');

  useEffect(() => {
    void (async () => {
      let response: globalThis.Response;
      try {
        response = await fetch(`/api/gestionar/${token}`);
      } catch {
        setState({ phase: 'unavailable' });
        return;
      }
      if (!response.ok) {
        // Solo un 404 significa de verdad "este código no existe". Cualquier
        // otra cosa es un problema nuestro, y decirle a alguien que su aviso
        // desapareció cuando no es cierto es el peor error que podemos cometer.
        setState({ phase: response.status === 404 ? 'missing' : 'unavailable' });
        return;
      }
      const { pet } = (await response.json()) as { pet: Pet };
      setState({ phase: 'ready', pet });
      setDescription(pet.description);
      setName(pet.name ?? '');
      setCityCode(pet.city_code);
      setNeighborhood(pet.neighborhood ?? '');
      setContactName(pet.contact_name);
      setContactPhone(pet.contact_phone);
      setContactWhatsapp(pet.contact_whatsapp);
      setReward(pet.reward ?? '');
      setColors(pet.colors as Color[]);
      setSize(pet.size ?? '');
    })();
  }, [token]);

  async function send(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/gestionar/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'No se pudo guardar.');
        return null;
      }
      setNotice(successMessage);
      return data;
    } catch {
      setError('Se cayó la conexión. Intentá otra vez.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  if (state.phase === 'loading') {
    return <div className="card h-64 animate-pulse" />;
  }

  if (state.phase === 'unavailable') {
    return (
      <div className="card p-8 text-center flex flex-col items-center gap-3">
        <span className="text-4xl" aria-hidden>
          ⏳
        </span>
        <h2 className="font-bold text-xl">No pudimos cargar tu aviso ahora</h2>
        <p className="text-ink-soft max-w-md">
          Es un problema nuestro, no tuyo: <strong>tu aviso sigue publicado</strong> y tu link
          sigue sirviendo. Recargá la página en un minuto.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-ink font-bold"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (state.phase === 'missing') {
    return (
      <div className="card p-8 text-center flex flex-col items-center gap-3">
        <span className="text-4xl" aria-hidden>
          🔑
        </span>
        <h2 className="font-bold text-xl">Este link de gestión no existe</h2>
        <p className="text-ink-soft max-w-md">
          Puede que el aviso ya se haya eliminado, o que el link esté incompleto. Revisá que lo
          hayas copiado entero.
        </p>
        <Link href="/" className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-ink font-bold">
          Ir al inicio
        </Link>
      </div>
    );
  }

  if (state.phase === 'deleted') {
    return (
      <div className="card p-8 text-center flex flex-col items-center gap-3">
        <span className="text-4xl" aria-hidden>
          🗑️
        </span>
        <h2 className="font-bold text-xl">El aviso se eliminó</h2>
        <p className="text-ink-soft">Ya no aparece en las búsquedas.</p>
        <Link href="/" className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-primary-ink font-bold">
          Ir al inicio
        </Link>
      </div>
    );
  }

  const { pet } = state;
  const reunited = pet.status === 'reunido';

  return (
    <div className="flex flex-col gap-6">
      <div className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <p className="font-bold text-lg">{pet.name?.trim() || 'Tu aviso'}</p>
          <p className="text-sm text-ink-soft">
            {pet.city_name}, {pet.department} · {reunited ? 'ya volvió a casa' : 'activo'}
          </p>
        </div>
        <Link
          href={`/mascota/${pet.slug}`}
          className="px-4 py-2.5 rounded-xl border border-border bg-surface font-semibold text-center shrink-0 hover:border-primary transition-colors"
        >
          Ver el aviso
        </Link>
      </div>

      {/* Estado */}
      <div
        className={`card p-5 flex flex-col gap-3 ${
          reunited ? 'bg-reunited-soft border-reunited/30' : 'bg-primary-soft border-primary/30'
        }`}
      >
        <h2 className="font-bold">{reunited ? '🎉 Marcado como reunido' : '¿Ya apareció?'}</h2>
        <p className="text-sm text-ink-soft">
          {reunited
            ? 'El aviso sigue visible, pero marcado para que nadie te siga escribiendo. Podés reactivarlo si hizo falta.'
            : 'Marcalo y dejamos de mostrarlo entre los que siguen perdidos. Esto ayuda a que quien busque no pierda tiempo.'}
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            const result = await send(
              { action: reunited ? 'reabrir' : 'reunido' },
              reunited ? 'El aviso está activo otra vez.' : '¡Qué alegría! Quedó marcado.',
            );
            if (result) setState({ phase: 'ready', pet: { ...pet, status: result.status } });
          }}
          className={`px-5 py-3 rounded-xl font-bold self-start ${
            reunited ? 'bg-surface border border-border' : 'bg-primary text-primary-ink'
          }`}
        >
          {reunited ? 'Volver a activarlo' : '🎉 Sí, ya está en casa'}
        </button>
      </div>

      {/* Edición */}
      <form
        className="card p-5 flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await send(
            {
              action: 'actualizar',
              description,
              name: name || null,
              cityCode: cityCode ?? undefined,
              neighborhood: neighborhood || null,
              contactName,
              contactPhone,
              contactWhatsapp,
              reward: reward || null,
              colors,
              size: size || null,
            },
            'Cambios guardados.',
          );
        }}
      >
        <h2 className="font-bold">Editar el aviso</h2>

        <div>
          <label className="field-label" htmlFor="m-nombre">
            Nombre
          </label>
          <input
            id="m-nombre"
            className="field"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="m-desc">
            Descripción
          </label>
          <textarea
            id="m-desc"
            className="field min-h-32 resize-y"
            required
            minLength={10}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <CityPicker value={cityCode} onChange={setCityCode} label="Municipio" />

        <div>
          <label className="field-label" htmlFor="m-barrio">
            Barrio o punto de referencia
          </label>
          <input
            id="m-barrio"
            className="field"
            value={neighborhood}
            maxLength={120}
            onChange={(e) => setNeighborhood(e.target.value)}
          />
        </div>

        <div>
          <span className="field-label">Colores</span>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((color) => {
              const on = colors.includes(color);
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setColors((current) =>
                      on
                        ? current.filter((c) => c !== color)
                        : current.length < 3
                          ? [...current, color]
                          : current,
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    on ? 'bg-primary text-primary-ink border-primary' : 'bg-surface border-border'
                  }`}
                >
                  {COLOR_LABEL[color]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="m-tamano">
            Tamaño
          </label>
          <select
            id="m-tamano"
            className="field"
            value={size}
            onChange={(e) => setSize(e.target.value as Size | '')}
          >
            <option value="">Sin especificar</option>
            {SIZES.map((option) => (
              <option key={option} value={option}>
                {SIZE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="m-contacto">
              Contacto
            </label>
            <input
              id="m-contacto"
              className="field"
              required
              value={contactName}
              maxLength={80}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="m-tel">
              Teléfono
            </label>
            <input
              id="m-tel"
              type="tel"
              className="field"
              required
              value={contactPhone}
              maxLength={30}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={contactWhatsapp}
            onChange={(e) => setContactWhatsapp(e.target.checked)}
            className="w-4 h-4 accent-[var(--primary)]"
          />
          <span>Este número tiene WhatsApp</span>
        </label>

        {pet.kind === 'perdido' && (
          <div>
            <label className="field-label" htmlFor="m-recompensa">
              Recompensa
            </label>
            <input
              id="m-recompensa"
              className="field"
              value={reward}
              maxLength={120}
              onChange={(e) => setReward(e.target.value)}
            />
          </div>
        )}

        {notice && <p className="text-primary font-semibold text-sm">{notice}</p>}
        {error && <p className="text-lost font-semibold text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-3 rounded-xl bg-primary text-primary-ink font-bold self-start disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      {/* Eliminar */}
      <details className="card p-5">
        <summary className="font-bold cursor-pointer text-lost">Eliminar el aviso</summary>
        <p className="text-sm text-ink-soft mt-2 mb-3">
          Se borran el aviso y las fotos para siempre. Si ya apareció, es mejor marcarlo como
          reunido: así queda el registro y anima a otras familias.
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            if (!confirm('¿Eliminar el aviso y sus fotos? Esto no se puede deshacer.')) return;
            const result = await send({ action: 'eliminar' }, 'Aviso eliminado.');
            if (result) setState({ phase: 'deleted' });
          }}
          className="px-5 py-2.5 rounded-xl border border-lost text-lost font-bold"
        >
          Eliminar definitivamente
        </button>
      </details>
    </div>
  );
}
