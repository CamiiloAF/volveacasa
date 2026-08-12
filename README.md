# 🐾 Volvé a Casa

Plataforma para publicar y buscar mascotas perdidas y encontradas en Colombia.
Gratis, sin crear cuenta, y con búsqueda en lenguaje natural: se escribe
*"un gato negro con mancha blanca en la cara"* y aparece lo que se le parezca.

- **Publicar sin cuenta.** Al final se entrega un link secreto de gestión para
  editar el aviso o marcar que ya apareció.
- **IA que mira la foto.** Gemini Flash extrae color, tamaño, raza aparente y
  señas particulares, y eso es lo que después hace que la búsqueda encuentre.
  Arranca en la capa gratuita.
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

En el panel de Supabase → **SQL Editor** → **New query**, pegá y ejecutá **las
migraciones en orden**:

1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) —
   tabla, índices, funciones de búsqueda, políticas de seguridad y bucket de fotos.
2. [`supabase/migrations/0002_busqueda_sin_excluir.sql`](supabase/migrations/0002_busqueda_sin_excluir.sql)
   — hace que el tamaño y el sexo puntúen en vez de excluir.

### 3. Variables de entorno

```bash
cp .env.example .env.local
```

Llenalas así:

| Variable | Dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → *Project URL* |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → *service_role* ⚠️ secreta |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API key (gratis) |
| `NEXT_PUBLIC_SITE_URL` | El dominio final. En local, `http://localhost:3000` |

### 4. Correr en local

```bash
pnpm install
pnpm dev
```

Abrí <http://localhost:3000/api/diagnostico>: te dice, campo por campo, si la
base, la búsqueda, el bucket y Gemini están respondiendo.

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
> proyecto: llamar a Gemini sin exponer la API key, generar la previsualización
> de cada aviso para WhatsApp, y que Google indexe cada mascota. El plan
> gratuito de Vercel cubre esto de sobra.

---

## Cómo funciona la búsqueda

Es el punto donde se decide si una familia encuentra a su mascota, así que vale
la pena entender las dos mitades:

**Al publicar**, Gemini mira las fotos y devuelve atributos de un vocabulario
cerrado (`src/lib/types.ts`): colores de una lista de 13, tamaño, sexo, pelaje,
más señas particulares en texto libre y palabras clave. Todo eso se aplana en
una columna `search_text` normalizada (minúscula, sin tildes).

**Al buscar**, Gemini convierte el texto libre en filtros usando *ese mismo*
vocabulario. Como los dos lados hablan el mismo idioma, filtrar es comparar
strings y no adivinar sinónimos.

La función `search_pets` en Postgres puntúa en vez de excluir: los colores y las
palabras clave suman puntos, y lo reciente pesa un poco más. Excluir sería peor
—dos personas describen distinto al mismo animal—, así que preferimos mostrar de
más y ordenar bien.

**Si Gemini falla o no hay API key, la app sigue en pie:** publicar guarda el
aviso sin atributos, y la búsqueda cae a un modo por palabras sueltas que
reconoce colores y especie. Peor que la IA, muchísimo mejor que un error.

### Costo, cuotas y escala

Todo esto está **medido contra la API real**, no sacado de la documentación:

| Modelo | Cuota gratuita | Sirve para |
|---|---|---|
| `gemini-3.5-flash-lite` | usable | **el default**: producción sin facturación |
| `gemini-3.6-flash` | se agota a las 20 peticiones | probar, o con facturación activa |

Por eso el default es Flash-Lite. Describiendo la foto de una mascota se
comporta casi igual: en la prueba con un gato bicolor sacó "manchas negras en el
hocico tipo bigote", "mancha negra en la barbilla" y "orejas negras". Flash da
algo más de detalle (agregó el color de los ojos) y cuesta más.

Dos detalles que cuestan plata si no se saben:

- **`max_output_tokens` incluye los tokens de razonamiento.** Con el presupuesto
  justo, el modelo piensa hasta agotarlo y devuelve el JSON cortado a la mitad.
  Por eso `thinking_level: 'low'` y presupuestos holgados: bajó el razonamiento
  de ~890 a ~150 tokens por búsqueda **y de paso dejó de inventar filtros**.
- **Un 429 no se arregla reintentando.** El SDK reintenta por defecto y cada
  reintento consume otra petición de la cuota. Va con `maxRetries: 1`.

Cuando el volumen crezca:

1. **Activar facturación** en Google AI Studio. Es el paso natural y sube las
   cuotas de golpe.
2. **Cachear por foto.** Hoy cada publicación llama al modelo una vez; si
   alguien republica la misma mascota se vuelve a pagar. Un hash de la imagen
   como clave evitaría el segundo llamado.

Cambiar de proveedor también es contenido: todo vive en `src/lib/ai.ts`, que
exporta solo tres funciones (`aiEnabled`, `extractAttributes`,
`parseSearchQuery`). El vocabulario cerrado de `types.ts` —donde está la
inteligencia real del buscador— no depende de ningún proveedor.

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
  Mucha gente publica desde el celular con datos contados, y la IA cobra por
  píxel.
- **Los municipios salen del DANE**, no de una lista escrita a mano. El archivo
  `src/lib/cities.ts` se genera; no lo edités a mano.
- **La búsqueda casi no excluye.** Solo la especie, la ciudad y si se perdió o se
  encontró sacan avisos de la lista. El color, el tamaño, el sexo y las palabras
  clave solo puntúan. El caso que lo justifica: con el sexo como filtro duro,
  buscar "perra blanca" descartaba todos los animales encontrados cuyo sexo nadie
  determinó — justo los que hay que mostrar.
- **Se puede re-analizar las fotos** desde el link de gestión. Si la IA falla al
  publicar (un pico de cuota), el aviso quedaba sin señas particulares para
  siempre; ahora se recupera con un botón.

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
      publicar/                    Sube fotos, llama a Gemini, inserta
      buscar/                      Interpreta la búsqueda y consulta
      gestionar/[token]/           Editar, marcar reunido, eliminar
      diagnostico/                 Chequeo de salud
  lib/
    ai.ts                          Los dos prompts y sus esquemas (Gemini)
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
- **Coincidencias automáticas con embeddings.** Google sí ofrece API de
  embeddings: guardando un vector por aviso se podría comparar cada "perdido"
  contra cada "encontrado" de la misma ciudad y avisar solo. Es el siguiente
  salto real del producto.
- Comparación foto contra foto entre perdidos y encontrados de la misma ciudad.
- Moderación básica para avisos duplicados o mal intencionados.
