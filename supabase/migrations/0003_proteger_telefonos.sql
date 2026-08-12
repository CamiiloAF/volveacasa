-- Protección de los teléfonos publicados.
--
-- Hasta ahora el número iba escrito en el HTML de cada aviso. Como el sitemap
-- lista todos los avisos, alguien recorría el sitio una vez y se llevaba la
-- lista completa de celulares de gente en una situación vulnerable.
--
-- Ahora el número sale de un endpoint aparte, que se llama cuando una persona
-- toca "Ver teléfono". Eso no lo hace imposible de raspar — nada que un humano
-- pueda ver lo es — pero lo vuelve caro: hay que hacer una petición por aviso,
-- y esta tabla las cuenta por IP y por día para cortar la recolección masiva.

create table if not exists contact_reveals (
  ip_hash    text not null,
  day        date not null default current_date,
  count      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (ip_hash, day)
);

-- Nunca guardamos la IP: solo un hash con sal. Sirve para contar, no para
-- identificar a nadie ni para reconstruir de dónde vino la consulta.
comment on column contact_reveals.ip_hash is
  'SHA-256 de la IP + sal del servidor. No permite recuperar la IP original.';

create index if not exists contact_reveals_day_idx on contact_reveals (day);

/**
 * Suma una consulta y responde si se puede mostrar el teléfono.
 * Devuelve true mientras la IP no haya pasado el tope del día.
 */
create or replace function bump_contact_reveal(p_ip_hash text, p_limit int default 40)
returns boolean
language plpgsql as $$
declare
  nuevo int;
begin
  insert into contact_reveals (ip_hash, day, count, updated_at)
  values (p_ip_hash, current_date, 1, now())
  on conflict (ip_hash, day) do update
    set count = contact_reveals.count + 1,
        updated_at = now()
  returning count into nuevo;

  return nuevo <= greatest(1, p_limit);
end $$;

-- Limpieza: los conteos de más de una semana no le sirven a nadie.
create or replace function purge_contact_reveals() returns void
language sql as $$
  delete from contact_reveals where day < current_date - 7;
$$;

alter table contact_reveals enable row level security;
-- Sin policies: solo el servidor (service role) escribe acá.
