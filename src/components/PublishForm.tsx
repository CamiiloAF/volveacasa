'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CityPicker } from '@/components/CityPicker';
import { cityLabel } from '@/lib/cities';
import { PhotoPicker } from '@/components/PhotoPicker';
import { PublishProgress, type PublishStage } from '@/components/PublishProgress';
import { saveListing } from '@/lib/misavisos';
import {
  COLORS,
  COLOR_LABEL,
  SEXES,
  SEX_LABEL,
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

type Success = {
  slug: string;
  manageToken: string;
  aiFailed: boolean;
  detected: { summary: string; marks: string[] };
};

export function PublishForm() {
  const [kind, setKind] = useState<Kind>('perdido');
  const [species, setSpecies] = useState<Species>('perro');
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cityCode, setCityCode] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [colors, setColors] = useState<Color[]>([]);
  const [size, setSize] = useState<Size | ''>('');
  const [sex, setSex] = useState<Sex>('desconocido');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState(true);
  const [contactPhoneAlt, setContactPhoneAlt] = useState('');
  const [reward, setReward] = useState('');

  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState<PublishStage>('preparando');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<Success | null>(null);

  const lost = kind === 'perdido';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (files.length === 0) {
      setError('Subí al menos una foto: sin foto casi nadie lo reconoce.');
      return;
    }
    if (!cityCode) {
      setError('Escogé el municipio.');
      return;
    }

    setSending(true);
    setStage('preparando');
    setUploadPercent(0);

    try {
      const form = new FormData();
      files.forEach((file) => form.append('fotos', file));
      form.append(
        'datos',
        JSON.stringify({
          kind,
          species,
          name: lost ? name : null,
          description,
          cityCode,
          neighborhood: neighborhood || null,
          eventDate: eventDate || null,
          contactName,
          contactPhone,
          contactWhatsapp,
          contactPhoneAlt: contactPhoneAlt || null,
          reward: lost ? reward || null : null,
          colors,
          size: size || null,
          sex,
        }),
      );

      // XMLHttpRequest y no fetch porque es lo único que reporta el avance de
      // la subida. En un celular con datos lentos, subir las fotos es la parte
      // más larga, y es justo la que sí podemos medir de verdad.
      const data = await new Promise<Success>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', '/api/publicar');

        request.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setStage('subiendo');
          setUploadPercent((event.loaded / event.total) * 100);
        };

        // Terminó de subir: de acá en adelante manda el servidor y la IA, y
        // cuánto tarde eso no lo sabemos.
        request.upload.onload = () => {
          setUploadPercent(100);
          setStage('analizando');
        };

        request.onload = () => {
          let body: { error?: string } & Partial<Success>;
          try {
            body = JSON.parse(request.responseText);
          } catch {
            reject(new Error('El servidor respondió algo inesperado.'));
            return;
          }
          if (request.status >= 200 && request.status < 300) resolve(body as Success);
          else reject(new Error(body.error ?? 'No se pudo publicar. Intentá otra vez.'));
        };

        request.onerror = () =>
          reject(new Error('Se cayó la conexión antes de terminar. Intentá otra vez.'));
        request.ontimeout = () =>
          reject(new Error('La conexión tardó demasiado. Intentá otra vez.'));

        request.send(form);
      });

      // Queda guardado en este dispositivo para que la persona lo recupere si
      // pierde el link. Nunca sale del navegador.
      saveListing({
        slug: data.slug,
        token: data.manageToken,
        label: (lost && name.trim()) || `${SPECIES_LABEL[species]} en ${cityLabel(cityCode)}`,
      });

      setSuccess(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Se cayó la conexión antes de terminar. Revisá tus datos e intentá otra vez.',
      );
    } finally {
      setSending(false);
    }
  }

  if (success) return <SuccessPanel success={success} />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {/* Qué pasó */}
      <fieldset className="card p-5 flex flex-col gap-4">
        <legend className="sr-only">Qué pasó</legend>

        <div>
          <span className="field-label">¿Qué pasó?</span>
          <div className="grid grid-cols-2 gap-2">
            <ChoiceButton
              active={lost}
              onClick={() => setKind('perdido')}
              title="Se me perdió"
              body="Estoy buscando a mi mascota"
            />
            <ChoiceButton
              active={!lost}
              onClick={() => setKind('encontrado')}
              title="Me encontré uno"
              body="Busco a su familia"
            />
          </div>
        </div>

        <div>
          <span className="field-label">¿Qué animal es?</span>
          <div className="flex gap-2 flex-wrap">
            {SPECIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSpecies(option)}
                aria-pressed={species === option}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  species === option
                    ? 'bg-primary text-primary-ink border-primary'
                    : 'bg-surface border-border hover:border-primary'
                }`}
              >
                {SPECIES_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      {/* Fotos */}
      <fieldset className="card p-5">
        <legend className="sr-only">Fotos</legend>
        <PhotoPicker files={files} onChange={setFiles} />
      </fieldset>

      {/* Descripción */}
      <fieldset className="card p-5 flex flex-col gap-4">
        <legend className="sr-only">Descripción</legend>

        {lost && (
          <div>
            <label className="field-label" htmlFor="nombre">
              ¿Cómo se llama? <span className="font-normal">(opcional)</span>
            </label>
            <input
              id="nombre"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Luna"
            />
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="descripcion">
            Contanos cómo es y qué pasó
          </label>
          <textarea
            id="descripcion"
            className="field min-h-32 resize-y"
            required
            minLength={10}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              lost
                ? 'Se salió el sábado en la tarde por el portón. Es muy asustadiza y no se deja coger de extraños. Tiene una mancha blanca en el pecho y el collar azul con su placa.'
                : 'Lo encontré caminando solo por la carrera 70. Está flaco pero sano, muy cariñoso. Lo tengo en mi casa mientras aparece su familia.'
            }
          />
          <p className="text-xs text-ink-soft mt-1.5">
            La IA lee esto junto con la foto para sacar las señas particulares.
          </p>
        </div>

        <details className="rounded-xl bg-surface-soft p-4">
          <summary className="font-semibold text-sm cursor-pointer">
            Ajustar color, tamaño y sexo (opcional)
          </summary>
          <p className="text-xs text-ink-soft mt-2 mb-3">
            Si no llenás nada, la IA lo deduce de la foto. Llenalo solo si querés corregirla.
          </p>

          <div className="flex flex-col gap-4">
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
                        on
                          ? 'bg-primary text-primary-ink border-primary'
                          : 'bg-surface border-border'
                      }`}
                    >
                      {COLOR_LABEL[color]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="tamano">
                  Tamaño
                </label>
                <select
                  id="tamano"
                  className="field"
                  value={size}
                  onChange={(e) => setSize(e.target.value as Size | '')}
                >
                  <option value="">Que lo deduzca la IA</option>
                  {SIZES.map((option) => (
                    <option key={option} value={option}>
                      {SIZE_LABEL[option]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="sexo">
                  Sexo
                </label>
                <select
                  id="sexo"
                  className="field"
                  value={sex}
                  onChange={(e) => setSex(e.target.value as Sex)}
                >
                  {SEXES.map((option) => (
                    <option key={option} value={option}>
                      {SEX_LABEL[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </details>
      </fieldset>

      {/* Dónde */}
      <fieldset className="card p-5 flex flex-col gap-4">
        <legend className="sr-only">Dónde</legend>

        <CityPicker value={cityCode} onChange={setCityCode} label="Municipio" required />

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="barrio">
              Barrio o punto de referencia <span className="font-normal">(opcional)</span>
            </label>
            <input
              id="barrio"
              className="field"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              maxLength={120}
              placeholder="Laureles, cerca al parque"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="fecha">
              ¿Qué día {lost ? 'se perdió' : 'lo encontraste'}?{' '}
              <span className="font-normal">(opcional)</span>
            </label>
            <input
              id="fecha"
              type="date"
              className="field"
              max={new Date().toISOString().slice(0, 10)}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* Contacto */}
      <fieldset className="card p-5 flex flex-col gap-4">
        <legend className="sr-only">Contacto</legend>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="contacto">
              ¿Cómo te llamás?
            </label>
            <input
              id="contacto"
              className="field"
              required
              minLength={2}
              maxLength={80}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Camila"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="telefono">
              Teléfono
            </label>
            <input
              id="telefono"
              type="tel"
              className="field"
              required
              minLength={7}
              maxLength={30}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="300 123 4567"
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={contactWhatsapp}
            onChange={(e) => setContactWhatsapp(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[var(--primary)]"
          />
          <span>Este número tiene WhatsApp (así es más fácil que te escriban)</span>
        </label>

        <div>
          <label className="field-label" htmlFor="telefono2">
            Otro teléfono <span className="font-normal">(opcional)</span>
          </label>
          <input
            id="telefono2"
            type="tel"
            className="field"
            maxLength={30}
            value={contactPhoneAlt}
            onChange={(e) => setContactPhoneAlt(e.target.value)}
            placeholder="El de un familiar, por si no contestás"
          />
          <p className="text-xs text-ink-soft mt-1.5">
            Sirve mucho: quien encuentra a un animalito suele llamar una sola vez.
          </p>
        </div>

        {lost && (
          <div>
            <label className="field-label" htmlFor="recompensa">
              Recompensa <span className="font-normal">(opcional)</span>
            </label>
            <input
              id="recompensa"
              className="field"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              maxLength={120}
              placeholder="Se da recompensa"
            />
          </div>
        )}

        <p className="text-xs text-ink-soft">
          Tu nombre y teléfono se muestran públicos en el aviso para que quien lo vea te pueda
          contactar. No publiques tu dirección exacta.
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="card p-4 bg-lost-soft text-lost border-lost/30 font-medium">
          {error}
        </p>
      )}

      {sending ? (
        <PublishProgress stage={stage} uploadPercent={uploadPercent} />
      ) : (
        <button
          type="submit"
          className="px-6 py-4 rounded-xl bg-primary text-primary-ink font-bold text-lg transition-opacity"
        >
          Publicar aviso
        </button>
      )}
    </form>
  );
}

function ChoiceButton({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`p-4 rounded-xl border text-left transition-colors ${
        active ? 'bg-primary-soft border-primary' : 'bg-surface border-border hover:border-primary'
      }`}
    >
      <span className="font-bold block">{title}</span>
      <span className="text-sm text-ink-soft">{body}</span>
    </button>
  );
}

function SuccessPanel({ success }: { success: Success }) {
  const [copied, setCopied] = useState(false);
  const manageUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/gestionar/${success.manageToken}`
      : `/gestionar/${success.manageToken}`;

  return (
    <div className="flex flex-col gap-6 fade-up">
      <div className="card p-6 sm:p-8 text-center flex flex-col items-center gap-3 bg-primary-soft border-primary/30">
        <span className="text-5xl" aria-hidden>
          🐾
        </span>
        <h2 className="text-2xl font-extrabold">¡Listo, ya está publicado!</h2>
        <p className="text-ink-soft max-w-md">
          Ahora compartilo por WhatsApp y en los grupos de tu barrio. Entre más gente lo vea, más
          posibilidades hay.
        </p>
        <Link
          href={`/mascota/${success.slug}`}
          className="mt-2 px-6 py-3 rounded-xl bg-primary text-primary-ink font-bold"
        >
          Ver el aviso y compartirlo
        </Link>
      </div>

      {success.detected.summary && (
        <div className="card p-5">
          <h3 className="font-bold mb-2">Esto detectó la IA en tus fotos</h3>
          <p className="text-ink-soft">{success.detected.summary}</p>
          {success.detected.marks.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {success.detected.marks.map((mark) => (
                <li
                  key={mark}
                  className="text-xs px-2.5 py-1 rounded-full bg-surface-soft text-ink-soft"
                >
                  {mark}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-soft mt-3">
            Si algo no coincide, podés corregirlo desde tu link de gestión.
          </p>
        </div>
      )}

      {success.aiFailed && (
        <p className="card p-4 text-sm text-ink-soft">
          No pudimos analizar las fotos automáticamente esta vez, pero tu aviso quedó publicado y
          se encuentra igual por ciudad y por texto.
        </p>
      )}

      <div className="card p-5 border-lost/40 bg-lost-soft/40">
        <h3 className="font-bold mb-1">⚠️ Guardá este link, es tu llave</h3>
        <p className="text-sm text-ink-soft mb-3">
          Como no creaste cuenta, este link es la única forma de editar el aviso o marcar que ya
          apareció. Mandátelo a vos mismo por WhatsApp para no perderlo.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={manageUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="field font-mono text-xs flex-1"
            aria-label="Link de gestión"
          />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(manageUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="px-5 py-3 rounded-xl bg-ink text-bg font-bold shrink-0"
          >
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
        </div>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Mi link para gestionar el aviso en Volvé a Casa: ${manageUrl}`,
          )}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-sm font-semibold text-primary"
        >
          Enviármelo por WhatsApp →
        </a>

        <p className="text-sm text-ink-soft mt-3 border-t border-border pt-3">
          Ya lo guardamos en este dispositivo: si volvés desde este mismo celular lo encontrás en{' '}
          <Link href="/mis-avisos" className="font-semibold text-primary">
            Mis avisos
          </Link>
          . Aun así mandátelo por WhatsApp — si cambiás de teléfono, esa copia es la única que
          queda.
        </p>
      </div>
    </div>
  );
}
