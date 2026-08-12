'use client';

import { useEffect, useState } from 'react';

export type PublishStage = 'preparando' | 'subiendo' | 'analizando';

/**
 * Mensajes que van rotando mientras la IA mira las fotos. No son decoración:
 * publicar puede tardar entre dos segundos y casi un minuto, y una pantalla
 * quieta durante ese rato hace que la gente crea que se colgó y recargue —
 * justo cuando está angustiada porque perdió a su mascota.
 */
const ANALYZING_MESSAGES = [
  'Mirando la foto para reconocer al animalito…',
  'Anotando los colores y el tamaño…',
  'Buscando señas particulares: manchas, orejas, cola…',
  'Escribiendo la descripción con la que otros lo van a encontrar…',
  'Ya casi, dejando todo listo…',
];

const STAGE_LABEL: Record<PublishStage, string> = {
  preparando: 'Preparando tus fotos',
  subiendo: 'Subiendo tus fotos',
  analizando: 'La IA está mirando tus fotos',
};

export function PublishProgress({
  stage,
  uploadPercent,
}: {
  stage: PublishStage;
  /** Porcentaje real de la subida. Solo se usa en la etapa 'subiendo'. */
  uploadPercent: number;
}) {
  const [seconds, setSeconds] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (stage !== 'analizando') return;
    const rotate = setInterval(
      () => setMessageIndex((i) => Math.min(i + 1, ANALYZING_MESSAGES.length - 1)),
      4000,
    );
    return () => clearInterval(rotate);
  }, [stage]);

  // Solo la subida tiene un porcentaje que conocemos de verdad.
  const isDeterminate = stage === 'subiendo';
  const slow = stage === 'analizando' && seconds >= 20;

  return (
    <div
      className="card p-5 flex flex-col gap-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden />
          {STAGE_LABEL[stage]}
        </p>
        {isDeterminate && (
          <span className="text-sm font-semibold text-ink-soft tabular-nums">
            {Math.round(uploadPercent)}%
          </span>
        )}
      </div>

      <div className="h-2 rounded-full bg-surface-soft overflow-hidden">
        {isDeterminate ? (
          <div
            className="h-full bg-primary rounded-full transition-[width] duration-200"
            style={{ width: `${Math.max(3, Math.min(100, uploadPercent))}%` }}
          />
        ) : (
          <div className="h-full w-2/5 bg-primary rounded-full bar-indeterminate" />
        )}
      </div>

      <p className="text-sm text-ink-soft">
        {stage === 'preparando' && 'Achicándolas para que suban rápido aunque tengas pocos datos.'}
        {stage === 'subiendo' && 'No cierres esta pantalla.'}
        {stage === 'analizando' && ANALYZING_MESSAGES[messageIndex]}
      </p>

      {slow && (
        <p className="text-sm text-ink-soft border-t border-border pt-3">
          Está tardando un poco más de lo normal ({seconds}s). Es normal cuando hay varias fotos
          — <strong>no cierres ni recargues</strong>, tu aviso se está publicando.
        </p>
      )}
    </div>
  );
}
