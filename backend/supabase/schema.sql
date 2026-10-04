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
-- Catálogo de canciones: playlists y sus canciones. Se rellena con `npm run catalog:upload --prefix backend`
-- (copia backend/src/catalog/catalog.json). El backend lo lee al arrancar.
-- ---------------------------------------------------------------------------
create table if not exists public.songs (
  id           text primary key,
  title        text   not null,
  artist_name  text   not null,
  album_name   text,
  year         int,
  image        text,
  preview_url  text   not null,                       -- fragmento de 30 s (iTunes)
  genre        text,
  language     text,                                   -- es, en u otro
  itunes_id    bigint,
  streams      bigint,                                 -- reproducciones en Spotify al crear la lista
  updated_at   timestamptz not null default now()
);

create table if not exists public.playlists (
  id           text primary key,
  name         text   not null,
  description  text,
  position     int    not null default 0,              -- orden en los ajustes
  is_default   boolean not null default false,         -- la que usa una sala nueva
  updated_at   timestamptz not null default now()
);

create table if not exists public.playlist_songs (
  playlist_id  text not null references public.playlists (id) on delete cascade,
  song_id      text not null references public.songs (id) on delete cascade,
  position     int  not null,                          -- puesto en el ranking (1 = la más escuchada)
  primary key (playlist_id, song_id)
);
create index if not exists playlist_songs_playlist_idx on public.playlist_songs (playlist_id, position);

alter table public.songs enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;

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
-- y ubicación) con `npm run geo:upload --prefix backend`, que las genera de backend/src/geo/countries.js. Solo el
-- backend las lee: con RLS activado y sin políticas, nadie puede leerlas desde el navegador con la anon key. Nunca
-- añadas una política de lectura pública.
--   type        multiple_choice | open | location | true_false | audio (true_false y audio aún no se juegan)
--   mode        modo de juego que la usa ('opciones', 'mundo'); null = cualquiera
--   category    ciencia, historia, literatura, musica, arte, deportes, peliculas_series, videojuegos, geografia, cultura
--   data        según el tipo; multiple_choice: { "options": ["…", "…", "…", "…"], "correct": 2 }
--               open: { "kind": "capital", "answer": "París", "aliases": [], "reject": [] } (bandera: + "flag": "fr")
--               location: { "kind": "location", "name": "Francia", "map": ["France"] }
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('multiple_choice', 'open', 'true_false', 'audio', 'location')),
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
-- Tablas creadas antes de las preguntas de ubicación: añade 'location' a los tipos permitidos.
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('multiple_choice', 'open', 'true_false', 'audio', 'location'));
