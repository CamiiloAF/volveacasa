# 🐾 Volvé a Casa

Plataforma para publicar y buscar mascotas perdidas y encontradas en Colombia.
Gratis, sin crear cuenta, y con búsqueda en lenguaje natural: se escribe
*"un gato negro con mancha blanca en la cara"* y aparece lo que se le parezca.

- **Publicar sin cuenta.** Al final se entrega un link secreto de gestión para
  editar el aviso o marcar que ya apareció.
- **IA que mira la foto.** Claude extrae color, tamaño, raza aparente y señas
  particulares, y eso es lo que después hace que la búsqueda encuentre.
- **Cada aviso tiene su URL.** Con previsualización real (foto + nombre +
  ciudad) al pegarla en WhatsApp o Facebook, que es como circulan estos avisos.
- **Los 1.122 municipios del DANE**, con filtro por ciudad.

---

## Puesta en marcha

### 1. Crear el proyecto de Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project** (el plan
   gratuito alcanza de sobra para empezar).
2. Escogé la región **East US (North Virginia)**: es la más cercana a Colombia
   de las gratuitas.
3. Guardá la contraseña de la base que te pida.

### 2. Correr la migración

En el panel de Supabase → **SQL Editor** → **New query**, pegá completo el
contenido de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
y dale **Run**. Eso crea la tabla, los índices, las funciones de búsqueda, las
políticas de seguridad y el bucket de fotos.

### 3. Variables de entorno

```bash
cp .env.example .env.local
```

Llenalas así:

| Variable | Dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → *Project URL* |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → *service_role* ⚠️ secreta |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `NEXT_PUBLIC_SITE_URL` | El dominio final. En local, `http://localhost:3000` |

### 4. Correr en local

```bash
pnpm install
pnpm dev
```

Abrí <http://localhost:3000/api/diagnostico>: te dice, campo por campo, si la
base, la búsqueda, el bucket y Claude están respondiendo.

---

## Publicar en internet (Vercel)

```bash
git init && git add -A && git commit -m "Volvé a Casa"
gh repo create volveacasa --public --source=. --push
```

Después, en [vercel.com](https://vercel.com) → **Add New → Project** → importá
el repo. Vercel detecta Next.js solo. Antes de darle *Deploy*, cargá las cuatro
variables de entorno de arriba (`NEXT_PUBLIC_SITE_URL` con el dominio que te
asigne Vercel, o el tuyo propio).

Una vez desplegado, verificá <https://TU-DOMINIO/api/diagnostico>.

> **Por qué Vercel y no GitHub Pages:** GitHub Pages solo sirve archivos
> estáticos, y esta app necesita servidor para tres cosas que son el corazón del
> proyecto: llamar a Claude sin exponer la API key, generar la previsualización
> de cada aviso para WhatsApp, y que Google indexe cada mascota. El plan
> gratuito de Vercel cubre esto de sobra.

---

## Cómo funciona la búsqueda

Es el punto donde se decide si una familia encuentra a su mascota, así que vale
la pena entender las dos mitades:

**Al publicar**, Claude mira las fotos y devuelve atributos de un vocabulario
cerrado (`src/lib/types.ts`): colores de una lista de 13, tamaño, sexo, pelaje,
más señas particulares en texto libre y palabras clave. Todo eso se aplana en
una columna `search_text` normalizada (minúscula, sin tildes).

**Al buscar**, Claude convierte el texto libre en filtros usando *ese mismo*
vocabulario. Como los dos lados hablan el mismo idioma, filtrar es comparar
strings y no adivinar sinónimos.

La función `search_pets` en Postgres puntúa en vez de excluir: los colores y las
palabras clave suman puntos, y lo reciente pesa un poco más. Excluir sería peor
—dos personas describen distinto al mismo animal—, así que preferimos mostrar de
más y ordenar bien.

**Si Claude falla o no hay API key, la app sigue en pie:** publicar guarda el
aviso sin atributos, y la búsqueda cae a un modo por palabras sueltas que
reconoce colores y especie. Peor que la IA, muchísimo mejor que un error.

---

## Decisiones que conviene no revertir sin pensarlo

- **Sin cuentas.** Quien está buscando a su mascota no está para registrarse. El
  link de gestión con token es el reemplazo: se guarda solo el hash SHA-256, así
  que ni con la base en la mano se sacan los códigos.
- **La tabla `pets` niega todo por RLS.** No hay cliente con llave anon: la app
  entra siempre desde el servidor. No es por el borrado (eso ya lo cuida el
  token) sino por los teléfonos — publicar tu número para que te llamen por tu
  perro no es lo mismo que regalárselo a un scraper.
- **Las fotos se encogen en el navegador** antes de subir (`src/lib/resize.ts`).
  Mucha gente publica desde el celular con datos contados, y Claude cobra por
  píxel.
- **Los municipios salen del DANE**, no de una lista escrita a mano. El archivo
  `src/lib/cities.ts` se genera; no lo edités a mano.

---

## Mapa del código

```
src/
  app/
    page.tsx                       Portada
    buscar/                        Búsqueda en lenguaje natural
    publicar/                      Formulario de publicación
    mascota/[slug]/
      page.tsx                     Detalle público
      opengraph-image.tsx          Previsualización para WhatsApp
    gestionar/[token]/             Edición con el link secreto
    api/
      publicar/                    Sube fotos, llama a Claude, inserta
      buscar/                      Interpreta la búsqueda y consulta
      gestionar/[token]/           Editar, marcar reunido, eliminar
      diagnostico/                 Chequeo de salud
  lib/
    anthropic.ts                   Los dos prompts y sus esquemas
    cities.ts                      1.122 municipios (generado)
    pets.ts                        Acceso a datos
    types.ts                       Vocabulario cerrado
supabase/migrations/0001_init.sql  Esquema completo
```

---

## Ideas para después

- Aviso por WhatsApp o correo cuando aparezca un animal parecido en tu ciudad.
- Mapa con el último punto donde se vio (las coordenadas de cada municipio ya
  están en `cities.ts`).
- Comparación foto contra foto entre perdidos y encontrados de la misma ciudad.
- Moderación básica para avisos duplicados o mal intencionados.
