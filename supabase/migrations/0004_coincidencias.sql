-- Segundo teléfono y cruce automático entre perdidos y encontrados.
--
-- El cruce es el corazón del asunto: hoy alguien tiene que buscar a mano y
-- adivinar cómo describió el animal la otra persona. Si el aviso de un perro
-- perdido y el de un perro encontrado en la misma ciudad describen al mismo
-- animal, la app debería darse cuenta sola y avisarles a los dos.

alter table pets add column if not exists contact_phone_alt text;

-- ---------------------------------------------------------------------------
-- Coincidencias detectadas
-- ---------------------------------------------------------------------------

create table if not exists pet_matches (
  lost_id    uuid not null references pets(id) on delete cascade,
  found_id   uuid not null references pets(id) on delete cascade,
  -- Qué tan probable es que sean el mismo animal, de 0 a 1, según la IA.
  score      real not null,
  -- En español y para leer: "ambos son gatos negros con mancha blanca en el
  -- pecho, perdido y encontrado a 3 días de diferencia en Laureles".
  reason     text not null,
  -- Para no volver a avisar de lo mismo.
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (lost_id, found_id)
);

create index if not exists pet_matches_lost_idx  on pet_matches (lost_id, score desc);
create index if not exists pet_matches_found_idx on pet_matches (found_id, score desc);

/**
 * Candidatos a comparar contra un aviso.
 *
 * Es el prefiltro barato antes de gastar una llamada a la IA: misma especie,
 * el tipo contrario (si este se perdió, buscamos los encontrados), activos, y
 * cerca — mismo municipio o al menos el mismo departamento, porque un animal
 * asustado cruza límites municipales sin enterarse.
 *
 * Ordena por colores en común: es la señal más confiable que tenemos antes de
 * que la IA lea las descripciones.
 */
create or replace function match_candidates(p_pet_id uuid, p_limit int default 6)
returns table (
  id uuid, slug text, name text, description text, colors text[],
  size pet_size, sex pet_sex, coat text, marks text[], breed_guess text,
  ai_summary text, city_name text, neighborhood text, event_date date,
  created_at timestamptz, colores_en_comun int
)
language sql stable as $$
  with objetivo as (
    select * from pets where id = p_pet_id
  )
  select
    c.id, c.slug, c.name, c.description, c.colors, c.size, c.sex, c.coat,
    c.marks, c.breed_guess, c.ai_summary, c.city_name, c.neighborhood,
    c.event_date, c.created_at,
    (select count(*) from unnest(c.colors) x where x = any (o.colors))::int
  from pets c, objetivo o
  where c.id <> o.id
    and c.status = 'activo'
    and c.species = o.species
    and c.kind <> o.kind
    and (c.city_code = o.city_code or c.department = o.department)
  order by
    -- Mismo municipio primero, después el resto del departamento.
    (c.city_code = o.city_code) desc,
    (select count(*) from unnest(c.colors) x where x = any (o.colors)) desc,
    c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

/**
 * Coincidencias de un aviso, con los datos de la otra publicación listos para
 * mostrar en tarjeta. Sirve para los dos lados: da igual si el aviso es el
 * perdido o el encontrado.
 */
create or replace function pet_matches_for(p_pet_id uuid, p_min_score real default 0.5)
returns table (
  id uuid, slug text, kind pet_kind, species pet_species, status pet_status,
  name text, description text, colors text[], size pet_size, sex pet_sex,
  coat text, marks text[], has_collar boolean, breed_guess text,
  ai_summary text, city_code text, city_name text, department text,
  neighborhood text, event_date date, photos text[], reward text,
  created_at timestamptz, score real, reason text
)
language sql stable as $$
  select
    p.id, p.slug, p.kind, p.species, p.status, p.name, p.description, p.colors,
    p.size, p.sex, p.coat, p.marks, p.has_collar, p.breed_guess, p.ai_summary,
    p.city_code, p.city_name, p.department, p.neighborhood, p.event_date,
    p.photos, p.reward, p.created_at, m.score, m.reason
  from pet_matches m
  join pets p
    on p.id = case when m.lost_id = p_pet_id then m.found_id else m.lost_id end
  where (m.lost_id = p_pet_id or m.found_id = p_pet_id)
    and m.score >= coalesce(p_min_score, 0.5)
    and p.status = 'activo'
  order by m.score desc, p.created_at desc;
$$;

alter table pet_matches enable row level security;
-- Sin policies: solo el servidor (service role) lee y escribe acá.
