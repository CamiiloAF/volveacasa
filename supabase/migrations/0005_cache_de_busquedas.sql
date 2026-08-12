-- Caché de interpretaciones de búsqueda.
--
-- El límite que aprieta no es el diario (500 peticiones) sino el de 15 por
-- minuto: si un aviso se comparte en un grupo grande, mucha gente busca lo
-- mismo al tiempo y se agota el cupo justo cuando más se necesita.
--
-- Y buscan literalmente lo mismo: "perro perdido medellin", "gato negro". Como
-- la interpretación de una búsqueda no cambia con el tiempo —"gato negro"
-- siempre significa lo mismo— alcanza con guardarla la primera vez. La segunda
-- persona que escriba eso no gasta ni una petición y además ve el resultado al
-- instante.

create table if not exists search_cache (
  -- El texto ya normalizado: minúscula, sin tildes, sin puntuación.
  query_norm text primary key,
  -- Los filtros que la IA sacó de ese texto.
  intent     jsonb not null,
  hits       int not null default 1,
  created_at timestamptz not null default now(),
  used_at    timestamptz not null default now()
);

create index if not exists search_cache_used_idx on search_cache (used_at desc);

/**
 * Busca una interpretación guardada y, si existe, la devuelve y anota el uso.
 * Devuelve null cuando toca preguntarle a la IA.
 */
create or replace function search_cache_get(p_query text)
returns jsonb
language plpgsql as $$
declare
  encontrado jsonb;
begin
  update search_cache
    set hits = hits + 1,
        used_at = now()
  where query_norm = p_query
  returning intent into encontrado;

  return encontrado;
end $$;

/** Guarda la interpretación de una búsqueda nueva. */
create or replace function search_cache_put(p_query text, p_intent jsonb)
returns void
language sql as $$
  insert into search_cache (query_norm, intent)
  values (p_query, p_intent)
  on conflict (query_norm) do update
    set intent = excluded.intent,
        used_at = now();
$$;

-- Limpieza: las búsquedas que nadie repitió en tres meses no valen el espacio.
create or replace function purge_search_cache() returns void
language sql as $$
  delete from search_cache
  where used_at < now() - interval '90 days' and hits <= 2;
$$;

alter table search_cache enable row level security;
-- Sin policies: solo el servidor (service role) la toca.
