-- El tamaño y el sexo dejan de excluir: ahora solo puntúan.
--
-- Con el filtro duro, buscar "perra blanca" descartaba todos los avisos de
-- animales encontrados cuyo sexo nadie pudo determinar — que son justo los que
-- hay que mostrarle a quien busca a su perra. El tamaño es igual de traicionero:
-- "mediano" para una persona es "grande" para otra, y quien recogió al animal en
-- la calle lo estima distinto que quien lo crió.
--
-- La regla queda pareja con la de los colores: lo que la persona dice sube el
-- puntaje, pero nada saca un aviso de la lista salvo especie, ciudad y si se
-- perdió o se encontró, que sí son hechos verificables.

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
        -- El tamaño coincide: ayuda, pero no define.
        + case when p_size is not null and p.size = p_size::pet_size then 1.0 else 0 end
        -- El sexo coincide: suma. Que sea 'desconocido' no resta — el animal
        -- encontrado en la calle casi nunca trae el dato, y es el que importa.
        + case when p_sex is not null and p.sex = p_sex::pet_sex then 1.0 else 0 end
        -- Empujón por cercanía en el tiempo: lo reciente importa más.
        + greatest(0, 2.0 - (extract(epoch from (now() - p.created_at)) / 86400.0) / 15.0)
      )::real as score
    from pets p
    where p.status = coalesce(p_status, 'activo')::pet_status
      -- Solo excluyen los hechos verificables.
      and (p_kind       is null or p.kind = p_kind::pet_kind)
      and (p_species    is null or p.species = p_species::pet_species)
      and (p_city_code  is null or p.city_code = p_city_code)
      and (p_department is null or p.department = p_department)
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
