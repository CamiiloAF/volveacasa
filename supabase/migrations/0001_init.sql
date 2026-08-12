-- Volvé a Casa — esquema inicial
-- Reportes de mascotas perdidas y encontradas en Colombia.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

do $$ begin
  create type pet_kind as enum ('perdido', 'encontrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pet_species as enum ('perro', 'gato', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pet_status as enum ('activo', 'reunido', 'archivado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pet_size as enum ('pequeno', 'mediano', 'grande');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pet_sex as enum ('macho', 'hembra', 'desconocido');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tabla principal
-- ---------------------------------------------------------------------------

create table if not exists pets (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,

  kind               pet_kind not null,
  species            pet_species not null,
  status             pet_status not null default 'activo',

  name               text,
  description        text not null,

  -- Atributos físicos. Los llena la IA a partir de la foto y los ajusta la persona.
  colors             text[] not null default '{}',
  size               pet_size,
  sex                pet_sex not null default 'desconocido',
  coat               text,
  marks              text[] not null default '{}',
  has_collar         boolean,
  collar_description text,
  breed_guess        text,
  ai_summary         text,
  ai_keywords        text[] not null default '{}',

  -- Ubicación (código DANE del municipio)
  city_code          text not null,
  city_name          text not null,
  department         text not null,
  neighborhood       text,
  event_date         date,

  -- Contacto
  contact_name       text not null,
  contact_phone      text not null,
  contact_whatsapp   boolean not null default true,
  reward             text,

  photos             text[] not null default '{}',

  -- Texto plano normalizado (minúscula, sin tildes) que arma la app para buscar.
  search_text        text not null default '',

  -- Hash SHA-256 del código de gestión. El código en claro nunca se guarda.
  manage_token_hash  text not null,

  reunited_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists pets_status_created_idx on pets (status, created_at desc);
create index if not exists pets_city_idx           on pets (city_code);
create index if not exists pets_department_idx     on pets (department);
create index if not exists pets_species_idx        on pets (species);
create index if not exists pets_kind_idx           on pets (kind);
create index if not exists pets_colors_idx         on pets using gin (colors);
create index if not exists pets_keywords_idx       on pets using gin (ai_keywords);
create index if not exists pets_search_trgm_idx    on pets using gin (search_text gin_trgm_ops);
create index if not exists pets_token_idx          on pets (manage_token_hash);

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists pets_set_updated_at on pets;
create trigger pets_set_updated_at before update on pets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Búsqueda: filtros estructurados + puntaje por coincidencias
-- ---------------------------------------------------------------------------

create or replace function search_pets(
  p_kind        text     default null,
  p_species     text     default null,
  p_city_code   text     default null,
  p_department  text     default null,
  p_colors      text[]   default null,
  p_size        text     default null,
  p_sex         text     default null,
  p_keywords    text[]   default null,
  p_status      text     default 'activo',
  p_limit       int      default 40,
  p_offset      int      default 0
)
returns table (
  id uuid, slug text, kind pet_kind, species pet_species, status pet_status,
  name text, description text, colors text[], size pet_size, sex pet_sex,
  coat text, marks text[], has_collar boolean, breed_guess text,
  ai_summary text, city_code text, city_name text, department text,
  neighborhood text, event_date date, photos text[], reward text,
  created_at timestamptz, score real
)
language sql stable as $$
  with scored as (
    select
      p.*,
      (
        1.0
        -- Cada color pedido que coincide suma fuerte: es la señal más confiable.
        + coalesce((
            select count(*) * 2.0 from unnest(coalesce(p_colors, '{}')) c
            where c = any (p.colors)
          ), 0)
        -- Cada palabra clave encontrada en el texto normalizado suma.
        + coalesce((
            select count(*) * 1.5 from unnest(coalesce(p_keywords, '{}')) k
            where p.search_text like '%' || k || '%'
          ), 0)
        -- Empujón por cercanía en el tiempo: lo reciente importa más.
        + greatest(0, 2.0 - (extract(epoch from (now() - p.created_at)) / 86400.0) / 15.0)
      )::real as score
    from pets p
    where p.status = coalesce(p_status, 'activo')::pet_status
      and (p_kind       is null or p.kind = p_kind::pet_kind)
      and (p_species    is null or p.species = p_species::pet_species)
      and (p_city_code  is null or p.city_code = p_city_code)
      and (p_department is null or p.department = p_department)
      and (p_size       is null or p.size = p_size::pet_size)
      and (p_sex        is null or p.sex = p_sex::pet_sex)
      -- Los colores no excluyen: un animal puede describirse distinto por cada
      -- persona, así que solo puntúan. Las palabras clave tampoco excluyen.
  )
  select
    id, slug, kind, species, status, name, description, colors, size, sex,
    coat, marks, has_collar, breed_guess, ai_summary, city_code, city_name,
    department, neighborhood, event_date, photos, reward, created_at, score
  from scored
  order by score desc, created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ---------------------------------------------------------------------------
-- Estadísticas para la portada
-- ---------------------------------------------------------------------------

create or replace function pet_stats()
returns table (activos bigint, reunidos bigint, ciudades bigint)
language sql stable as $$
  select
    count(*) filter (where status = 'activo'),
    count(*) filter (where status = 'reunido'),
    count(distinct city_code)
  from pets;
$$;

-- ---------------------------------------------------------------------------
-- RLS: nadie llega directo a la tabla; todo pasa por el servidor de Next.js
-- ---------------------------------------------------------------------------

alter table pets enable row level security;

-- Sin ninguna policy, RLS niega todo a las llaves anon y authenticated. La app
-- lee y escribe desde el servidor con la service role key, que salta RLS.
--
-- El motivo no es el borrado ni la edición (eso ya lo protege el código de
-- gestión), sino los teléfonos: los avisos son públicos de a uno, pero con una
-- llave anon y `select *` cualquiera se descargaría la lista completa de
-- números en un rato. Publicar el teléfono para que te llamen por tu mascota no
-- es lo mismo que regalárselo a un scraper.
drop policy if exists "lectura publica" on pets;

-- ---------------------------------------------------------------------------
-- Storage: bucket público de fotos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "fotos lectura publica" on storage.objects;
create policy "fotos lectura publica" on storage.objects
  for select using (bucket_id = 'fotos');
