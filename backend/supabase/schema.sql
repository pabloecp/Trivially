-- Trivially: tabla de usuarios. Pégalo en Supabase -> SQL Editor -> New query -> Run.
create table if not exists public.users (
  id          text primary key,
  email       text,
  google_id   text,
  name        text,
  avatar      text,
  is_guest    boolean not null default false,
  stats       jsonb   not null default '{}'::jsonb,   -- totalScore, bestScore, gamesPlayed, wins, bestStreak, correctAnswers, artistHits
  data        jsonb   not null,                        -- el usuario completo (incluye hash de contraseña)
  updated_at  timestamptz not null default now()
);

create unique index if not exists users_google_id_key on public.users (google_id) where google_id is not null;
create index if not exists users_email_idx on public.users (lower(email));

-- El backend usa la service_role key (se salta RLS). Con RLS activado y sin políticas,
-- nadie puede leer/escribir la tabla desde el navegador con la anon key.
alter table public.users enable row level security;

-- Roles (user, moderator, admin, owner). El rol se guarda dentro de `data`; esta columna
-- solo lo muestra en el Table Editor y permite filtrar. Es de solo lectura (generada).
alter table public.users
  add column if not exists role text generated always as (coalesce(data->>'role', 'user')) stored;
create index if not exists users_role_idx on public.users (role);

-- ---------------------------------------------------------------------------
-- Catálogo de canciones. Se rellena con `npm run catalog:upload --prefix backend` (copia
-- backend/src/catalog/catalog.json). El backend lo lee al arrancar; los rankings en español y en inglés (y con ellos la
-- dificultad) salen del idioma y las reproducciones de cada canción, sin tablas de playlists.
-- ---------------------------------------------------------------------------
create table if not exists public.songs (
  id           text primary key,
  title        text   not null,
  artist_name  text   not null,
  artists      text[],                                 -- todos los artistas de la canción, en el orden de Spotify
  album_name   text,
  year         int,
  image        text,
  preview_url  text   not null,                       -- fragmento de 30 s (iTunes)
  genre        text,
  language     text,                                   -- es, en u otro
  itunes_id    bigint,
  streams      bigint,                                 -- reproducciones totales en Spotify
  updated_at   timestamptz not null default now()
);

alter table public.songs add column if not exists artists text[];
alter table public.songs enable row level security;
-- Las tablas de playlists ya no se usan.
drop table if exists public.playlist_songs;
drop table if exists public.playlists;

-- ---------------------------------------------------------------------------
-- Canciones de Spotify ya buscadas en iTunes (playlists personalizadas de los owners). Se rellena sola: cada canción
-- se busca una vez y aquí queda su fragmento y portada, o found = false si iTunes no la tiene.
-- ---------------------------------------------------------------------------
create table if not exists public.spotify_songs (
  spotify_id       text primary key,
  found            boolean not null default false,
  title            text   not null,                     -- título limpio (sin "- Remastered", "(feat. …)")
  artist_name      text   not null,
  album_name       text,
  year             int,
  image            text,                                -- portada (iTunes)
  preview_url      text,                                -- fragmento de 30 s (iTunes)
  itunes_id        bigint,
  catalog_song_id  text,                                -- si ya estaba en el catálogo (songs.id)
  updated_at       timestamptz not null default now()
);
alter table public.spotify_songs enable row level security;

-- ---------------------------------------------------------------------------
-- Preguntas de los modos de trivia. Opción múltiple se rellena con `npm run questions:upload --prefix backend`, que
-- copia backend/private/questions.json (fuera del repo, que es público); Geografía (mode 'mundo': capitales, banderas
-- y ubicación) con `npm run geo:upload --prefix backend`, que las genera de backend/src/geo/countries.js; Historia
-- (mode 'historia') con `npm run history:upload` y Campo de minas (mode 'minas') con `npm run mines:upload`. Solo el
-- backend las lee: con RLS activado y sin políticas, nadie puede leerlas desde el navegador con la anon key. Nunca
-- añadas una política de lectura pública.
--   type        multiple_choice | open | location | year | minefield | true_false | audio (true_false y audio aún no
--               se juegan)
--   mode        modo de juego que la usa ('opciones', 'mundo', 'historia', 'minas'); null = cualquiera
--   category    ciencia, historia, literatura, musica, arte, deportes, peliculas_series, videojuegos, geografia, cultura
--   data        según el tipo; multiple_choice: { "options": ["…", "…", "…", "…"], "correct": 2 }
--               open: { "kind": "capital", "answer": "París", "aliases": [], "reject": [] } (bandera: + "flag": "fr")
--               location: { "kind": "location", "name": "Francia", "map": ["France"] }
--               year: { "year": 1492 }
--               minefield: { "correct": ["España", …], "wrong": ["Marruecos", …] } (las 25 casillas del tablero)
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('multiple_choice', 'open', 'true_false', 'audio', 'location', 'year', 'minefield')),
  mode        text,
  category    text not null,
  difficulty  text not null check (difficulty in ('facil', 'media', 'dificil')),
  language    text not null default 'es',
  prompt      text not null,
  data        jsonb not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists questions_pick_idx on public.questions (type, mode, difficulty) where active;
alter table public.questions enable row level security;
-- Tablas creadas antes de las preguntas de ubicación (Geografía), de año (Historia) y de tablero (Campo de minas):
-- añade 'location', 'year' y 'minefield' a los tipos permitidos.
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('multiple_choice', 'open', 'true_false', 'audio', 'location', 'year', 'minefield'));

-- ---------------------------------------------------------------------------
-- Reportes de preguntas: un owner toca "Reportar" durante una partida y aquí queda la pregunta tal como se jugó
-- (con su respuesta), los ajustes de la partida y quiénes estaban en la sala, para revisarla después. Solo el backend
-- (service_role) lee y escribe: RLS activado y sin políticas.
-- ---------------------------------------------------------------------------
create table if not exists public.question_reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  game         text not null,                           -- opciones, musica, mundo, historia, minas
  question_id  text,                                    -- id de la pregunta o canción (questions.id / songs.id)
  prompt       text,                                    -- el texto de la pregunta, o "Título - Artista"
  reporter_id  text not null,
  room_code    text,
  resolved     boolean not null default false,          -- marcarlo a mano al revisarlo
  data         jsonb not null                           -- todo lo demás: pregunta completa, ajustes, jugadores
);
create index if not exists question_reports_created_idx on public.question_reports (created_at desc);
alter table public.question_reports enable row level security;

-- ---------------------------------------------------------------------------
-- Playlists compartidas por código ("Copiar código" en el panel de la playlist): el código (10 letras y números,
-- "K7P2M-XH4QN") apunta a la playlist (nombre, orden y juegos con sus ajustes). La misma playlist siempre tiene el mismo
-- código (hash único), y un código que nadie abre en un año se borra (last_used_at). Solo el backend lee y escribe.
-- ---------------------------------------------------------------------------
create table if not exists public.shared_playlists (
  code          text primary key,
  hash          text not null unique,                   -- sha256 de la playlist: la misma playlist, el mismo código
  data          jsonb not null,                         -- { name, order, items: [{ game, config }] }
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now()      -- al compartirla o abrirla otra vez
);
create index if not exists shared_playlists_last_used_idx on public.shared_playlists (last_used_at);
alter table public.shared_playlists enable row level security;

-- ---------------------------------------------------------------------------
-- Amigos. Una fila por pareja de cuentas (user_a < user_b): `pending` (alguien envió la solicitud, requested_by) o
-- `accepted`. Como el resto, solo el backend (service_role) la lee: RLS activado y sin políticas.
create table if not exists public.friendships (
  user_a       text not null,
  user_b       text not null,
  status       text not null check (status in ('pending', 'accepted')),
  requested_by text not null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b_idx on public.friendships (user_b);
alter table public.friendships enable row level security;
