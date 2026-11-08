# Variables de entorno

Dónde va cada variable y qué hace. Los valores reales nunca van en el repositorio (es público): solo en los archivos
`.env` de cada computadora (ignorados por git) y en los paneles de Railway y Vercel.

Hay **cuatro lugares**:

| Lugar | Para qué |
|---|---|
| `backend/.env` (tu computadora) | El servidor en local (`npm run dev`) y los comandos de `backend/scripts` (subir preguntas, copias…). |
| `frontend/.env` (tu computadora) | La página en local. Casi siempre vacío. |
| Railway → Variables | El servidor en producción. |
| Vercel → Settings → Environment Variables | La página en producción (se meten al construirla: después de cambiarlas hay que volver a publicar). |

El servidor lee `backend/.env` y, si existe, también un `.env` en la raíz del proyecto; no hace falta el de la raíz.

## Servidor (`backend/.env` y Railway)

| Variable | Local | Railway | Qué hace |
|---|---|---|---|
| `PORT` | `8080` | `8080` | Puerto del servidor. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | `https://triviallyonline.vercel.app` | La dirección de la página. Decide qué páginas pueden usar el servidor y a dónde vuelve el login. |
| `ALLOWED_ORIGINS` | (vacía) | (vacía; el dominio propio cuando lo haya) | Otras direcciones de la página que pueden usar el servidor, separadas por comas. |
| `SESSION_SECRET` | cualquier texto | **obligatoria**, larga y al azar | Firma las sesiones. En producción el servidor no arranca sin ella. Cambiarla desconecta a todos. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | las mismas que Railway (opcional) | de Google Cloud | Iniciar sesión con Google. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8080/auth/google/callback` | `https://triviallyonline.vercel.app/auth/google/callback` | A dónde vuelve Google. Tiene que estar también en Google Cloud → Credenciales. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | las de Supabase (opcional) | las de Supabase | La base de datos. Sin ellas, en local se usan archivos (`backend/data`, `backend/private`). La clave da acceso total: nunca en la página ni en el repositorio. |
| `OWNER_IDS` | igual que Railway | ids de los dueños, separados por comas | Quién tiene el panel de dueño. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | opcional | de Spotify | Playlists de Spotify en Adivina la canción. |
| `SPOTIFY_REDIRECT_URI` | opcional | opcional | A dónde vuelve Spotify al conectar una cuenta (si no, se calcula). |
| `LYNZ_API_URL` | opcional | la de la API de Lynz | El top 100 de Lynz como playlist. Sin ella no aparece. |
| `LYRICS_DB` | opcional | `1` | Lee las rondas de "Letra" de Supabase al arrancar, y cada 2 minutos las que se subieron después (sin reiniciar). |
| `QUESTION_STATS` | `0` al hacer pruebas de carga | (vacía) | Con `0` no se cuentan los aciertos y fallos de cada pregunta (`question_stats`). Vacía: se cuentan. |
| `SENTRY_DSN` | vacía | la del proyecto `trivially-servidor` | Errores del servidor a Sentry. Vacía: no se manda nada. |
| `RESEND_API_KEY` / `EMAIL_FROM` | vacías | solo con dominio propio verificado en Resend | Correos de "¿Olvidaste tu contraseña?". Sin ellas, en local el enlace sale en la consola y en producción la página avisa que no puede mandar correos. `EMAIL_FROM` tiene que ser del dominio verificado (no sirve una dirección de Gmail). |

Solo para pruebas (no se ponen a mano): `TRIVIALLY_STORE_PATH`, `FRIENDS_FILE`, `LYNZ_CACHE_FILE`, `MATCH_SIZE`.
Railway pone solo `RAILWAY_ENVIRONMENT_NAME`; `SENTRY_ENVIRONMENT` es opcional.

## Página (`frontend/.env` y Vercel)

| Variable | Local | Vercel | Qué hace |
|---|---|---|---|
| `VITE_API_URL` | (vacía) | (vacía) | Vacía, la página llama a `/api` y `/auth` en su propia dirección: en local Vite las pasa al servidor (`8080`) y en Vercel lo hace `vercel.json`. Solo se llena para apuntar a otro servidor. |
| `VITE_SENTRY_DSN` | vacía | la del proyecto `trivially-pagina` | Errores de la página a Sentry. No es secreta (va dentro de la página). |
