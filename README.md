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
3. [`supabase/migrations/0003_proteger_telefonos.sql`](supabase/migrations/0003_proteger_telefonos.sql)
   — tope por IP para que no se puedan recolectar los teléfonos en masa.
4. [`supabase/migrations/0004_coincidencias.sql`](supabase/migrations/0004_coincidencias.sql)
   — segundo teléfono y cruce automático entre perdidos y encontrados.
5. [`supabase/migrations/0005_cache_de_busquedas.sql`](supabase/migrations/0005_cache_de_busquedas.sql)
   — caché de búsquedas, para no gastar cupo en preguntar dos veces lo mismo.

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

| Modelo | Precio (entrada / salida por millón) | Nota |
|---|---|---|
| **`gemini-3.1-flash-lite`** | **$0.25 / $1.50** | **el default** |
| `gemini-3.5-flash-lite` | $0.30 / $2.50 | igual de bueno, más caro |
| `gemini-3.6-flash` | más caro aún | agota su cuota gratuita a las 20 peticiones |
| `gemini-2.5-flash-lite` | — | ya no se le da a cuentas nuevas |

Elegido midiendo contra la API real con la foto de un perro y dos candidatos —
uno que sí era el mismo animal y otro que claramente no. Flash-Lite 3.1 acertó
igual que los caros (1.0 al que coincidía, 0.0 al que no) y saca las mismas
señas particulares.

**La latencia no sirve para decidir**: en la capa gratuita va de 4 a 83 segundos
según la cola del momento, y varía más entre dos llamadas al mismo modelo que
entre modelos distintos. Por eso hay un tope de espera (`GEMINI_TIMEOUT_MS`, 40s
por defecto): Vercel corta la función a los 60 y sin ese tope un pico de cola
tumbaba la publicación entera.

**Los límites gratuitos reales** (vistos en el panel de una cuenta, agosto 2026;
dependen de la cuenta y la región — mirá los tuyos en
[aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit)):

| Modelo | Por minuto | Por día |
|---|---|---|
| `gemini-3.1-flash-lite` y `3.5-flash-lite` | 15 | **500** |
| `gemini-3.6-flash` | 5 | **20** |

Esa diferencia —20 contra 500 al día— es la razón de fondo para estar en
Flash-Lite: con Flash la app se queda sin IA a media mañana.

**El límite que aprieta es el de 15 por minuto**, no el diario. Cuando un aviso
se comparte en un grupo grande, mucha gente busca lo mismo al tiempo. Por eso
las interpretaciones de búsqueda se cachean (`search_cache`): "gato negro"
significa lo mismo hoy que mañana, así que se le pregunta a la IA una sola vez y
las demás personas obtienen la respuesta al instante y sin gastar cupo.

**Una sola llamada por publicación.** Describir la foto y cruzarla contra los
avisos cercanos son dos preguntas sobre lo mismo, así que van juntas: se
inserta el aviso primero (sin datos de IA), se consultan los candidatos, y una
única llamada devuelve los atributos y las comparaciones. Separarlas gastaba el
doble de cuota sin mejorar nada — al contrario, así el modelo compara la foto
real contra las descripciones en vez de comparar dos textos.

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
- **El teléfono no va en el HTML.** Sale de `/api/contacto/<slug>` cuando alguien
  toca "Ver cómo contactar". Antes bastaba recorrer el sitemap una vez para
  llevarse todos los celulares de gente en una situación vulnerable; ahora hace
  falta una petición por aviso y hay un tope diario por IP. No lo vuelve
  imposible —nada que un humano pueda ver lo es— pero sí lo vuelve caro.
- **No hay recuperación del link de gestión por teléfono, y es a propósito.** El
  teléfono es público en el aviso: cualquiera que lo lea pediría el link y se
  apoderaría de la publicación, con el riesgo real de que le cambien el contacto
  a un aviso de mascota perdida para extorsionar a la familia. La recuperación
  necesita un canal que la persona controle (correo o SMS), no un dato visible.

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
    mis-avisos/                    Avisos guardados en este dispositivo
    api/
      publicar/                    Sube fotos, llama a Gemini, inserta
      buscar/                      Interpreta la búsqueda y consulta
      gestionar/[token]/           Editar, marcar reunido, eliminar
      contacto/[slug]/             Entrega el teléfono, con tope por IP
      diagnostico/                 Chequeo de salud
  lib/
    ai.ts                          Los dos prompts y sus esquemas (Gemini)
    cities.ts                      1.122 municipios (generado)
    misavisos.ts                   Links de gestión guardados en el navegador
    pets.ts                        Acceso a datos
    types.ts                       Vocabulario cerrado
supabase/migrations/0001_init.sql  Esquema completo
```

---

## El cruce entre perdidos y encontrados

Es la función que convierte esto en algo que reúne mascotas, y no en un tablón
de anuncios donde hay que buscar a mano.

Cuando alguien publica, la app compara ese aviso contra los del tipo contrario
que estén cerca y le avisa a los dos lados si cree que es el mismo animal.

**Cómo funciona, en tres pasos:**

1. **Prefiltro barato en SQL** (`match_candidates`): misma especie, tipo
   contrario, activos, mismo municipio o al menos el mismo departamento —un
   animal asustado cruza límites municipales sin enterarse—, ordenados por
   colores en común. Máximo 6 candidatos.
2. **Una sola llamada a la IA** que compara el aviso contra esos 6 y devuelve,
   por cada uno, una probabilidad y una razón escrita para que la familia la
   entienda.
3. **Se guardan** en `pet_matches` los que pasan de 0.4, y se le muestran a la
   gente los que pasan de 0.5.

**Dos decisiones que importan:**

- **Corre con `after()` de Next**, o sea después de responderle a quien publica.
  Es una segunda llamada a la IA y publicar ya se siente lento; así no le suma
  ni un segundo.
- **Nunca se muestra un porcentaje.** "87% de coincidencia" suena a certeza y
  acá no la hay: se dice "Se parece mucho", "Se parece bastante" o "Podría ser",
  con la razón concreta al lado. Quien decide es la familia mirando la foto.

El prompt está calibrado para eso mismo: ser demasiado optimista le da falsas
esperanzas a alguien que está sufriendo, y ser demasiado estricto pierde un
reencuentro. Está escrito en `src/lib/ai.ts` y vale la pena leerlo antes de
tocarlo.

---

## Recuperar el link de gestión

Sin cuentas, el link es la única llave. Hay dos capas:

1. **"Mis avisos"** (`/mis-avisos`) — al publicar, el link queda guardado en el
   `localStorage` del navegador. Quien vuelve desde el mismo celular lo
   encuentra ahí. Gratis, instantáneo y sin exponer nada: no viaja al servidor.
2. **La copia por WhatsApp** que se ofrece al publicar. Es la que sobrevive a un
   cambio de teléfono.

Si alguien pierde las dos, hoy no hay forma de devolvérselo: del código solo se
guarda su hash. La solución pendiente es **recuperación por correo** — pedir un
email opcional al publicar y mandar el link ahí. El correo sirve porque no es
público; el teléfono no, por lo explicado más arriba.

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
