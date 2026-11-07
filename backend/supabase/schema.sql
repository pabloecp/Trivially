-- Trivially: tabla de usuarios. Pégalo en Supabase -> SQL Editor -> New query -> Run.
-- Cada cuenta es una fila con una columna por dato (backend/src/db/store.js, ACCOUNT_COLUMNS). Lo que no tiene columna
-- propia va en `extra`. Solo las cuentas: los invitados viven en la memoria del servidor.
create table if not exists public.users (
  id                text primary key,
  name              text,
  username          text,                                 -- @usuario, en minúsculas
  email             text,
  avatar            text,                                 -- color del Blob o foto de Google
  role              text,                                 -- user, moderator, admin u owner (vacío = user)
  password_hash     text,                                 -- contraseña cifrada (scrypt); nadie puede leerla
  password_salt     text,
  google_id         text,
  google_photo      text,
  is_guest          boolean not null default false,
  stats             jsonb   not null default '{}'::jsonb, -- totalScore, bestScore, gamesPlayed, wins, bestStreak, correctAnswers, artistHits
  rank              jsonb,                                -- rango de Competitivo
  elo               jsonb,                                -- elo de cada juego
  together          jsonb,                                -- con quién jugó cuántas veces (contra el abuso del elo)
  daily             jsonb,                                -- reto del día
  daily_done        integer,                              -- retos completados
  history           jsonb,                                -- últimas 10 partidas
  spotify           jsonb,                                -- cuenta de Spotify conectada (con sus claves)
  saved_spotify     jsonb,                                -- playlists guardadas
  username_history  jsonb,                                -- @usuarios anteriores (los reserva un tiempo)
  username_changes  jsonb,                                -- cuándo cambió de @usuario
  username_auto     boolean,                              -- @usuario puesto por el servidor
  extra             jsonb   not null default '{}'::jsonb, -- cualquier otro dato de la cuenta
  data              jsonb,                                -- la cuenta entera, como se guardaba antes; vacío ya reordenada
  updated_at        timestamptz not null default now()
);

-- Una tabla de antes (todo en `data`, con `role` y `username` sacadas de ahí) pasa a columnas. Se puede correr las
-- veces que sea: solo cambia lo que falta. El servidor reescribe cada cuenta en columnas al arrancar.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users'
             and column_name = 'role' and is_generated = 'ALWAYS') then
    alter table public.users drop column role;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users'
             and column_name = 'username' and is_generated = 'ALWAYS') then
    alter table public.users drop column username;
  end if;
end $$;
alter table public.users
  add column if not exists username          text,
  add column if not exists role              text,
  add column if not exists password_hash     text,
  add column if not exists password_salt     text,
  add column if not exists google_photo      text,
  add column if not exists rank              jsonb,
  add column if not exists elo               jsonb,
  add column if not exists together          jsonb,
  add column if not exists daily             jsonb,
  add column if not exists daily_done        integer,
  add column if not exists history           jsonb,
  add column if not exists spotify           jsonb,
  add column if not exists saved_spotify     jsonb,
  add column if not exists username_history  jsonb,
  add column if not exists username_changes  jsonb,
  add column if not exists username_auto     boolean,
  add column if not exists extra             jsonb not null default '{}'::jsonb;
alter table public.users alter column data drop not null;

create unique index if not exists users_google_id_key on public.users (google_id) where google_id is not null;
create index if not exists users_email_idx on public.users (lower(email));
-- @usuario único sin importar mayúsculas: si dos cuentas llegaran a tener el mismo, Supabase rechaza la segunda.
create unique index if not exists users_username_key on public.users (lower(username)) where username is not null;
create index if not exists users_role_idx on public.users (role);

-- El backend usa la service_role key (se salta RLS). Con RLS activado y sin políticas,
-- nadie puede leer/escribir la tabla desde el navegador con la anon key.
alter table public.users enable row level security;

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
--   type        multiple_choice | open | location | year | number | minefield | true_false (true_false aún no se
--               juega)
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
  type        text not null check (type in ('multiple_choice', 'open', 'true_false', 'location', 'year', 'number', 'minefield')),
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
-- Tablas creadas antes: deja como permitidos los tipos de hoy (con 'location', 'year', 'number' y 'minefield', y
-- sin 'audio', que se quitó). Si quedara alguna fila de tipo 'audio', bórrala antes o esto falla.
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('multiple_choice', 'open', 'true_false', 'location', 'year', 'number', 'minefield'));

-- ---------------------------------------------------------------------------
-- "Completa la letra" (Adivina la canción): la ronda de cada canción, preparada una vez offline (`npm run
-- lyrics:build`: el fragmento que suena, transcrito con Whisper y comparado con la letra de LRCLIB). Una fila por
-- canción, atada al audio exacto con que se midió: preview_url y preview_etag (si Apple o Spotify cambian el
-- fragmento, la ronda se salta). song_id es el id del catálogo, o "sp-<id de Spotify>" para las canciones de una
-- playlist de Spotify pegada como link (que suenan con su propio fragmento); spotify_id, el de Spotify cuando lo hay.
-- data, solo lo mínimo: { "lines": [{ "at", "text" }] (las líneas que se muestran; la última con "___"), "cut" y
-- "end" (segundos del fragmento: dónde se corta y hasta dónde suena al revelar), "answer", "wrong": [tres] }; null =
-- esa canción no sirve. Las letras tienen derechos y el repo es público: solo el backend (service_role) lee y
-- escribe, RLS activado y sin políticas. El servidor la lee al arrancar con LYRICS_DB=1; `npm run lyrics:upload` la
-- llena desde backend/private/lyric-rounds.json.
-- ---------------------------------------------------------------------------
create table if not exists public.lyric_rounds (
  song_id       text primary key,
  spotify_id    text,
  preview_url   text not null,
  preview_etag  text,
  data          jsonb,
  updated_at    timestamptz not null default now()
);
create index if not exists lyric_rounds_spotify_idx on public.lyric_rounds (spotify_id);
alter table public.lyric_rounds enable row level security;

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

-- Cómo le va a cada pregunta en las partidas (backend/src/game/questionStats.js y db/questionStats.js): una fila por
-- juego, pregunta y variante (Trivia: opciones / escribir; Adivina la canción: titulo:opciones…; Encuentra el país: su
-- modo; Rango: su tipo; Campo de minas: turnos / carrera). Solo cuentan personas, nunca bots ni desempates. Los
-- números solo crecen: el servidor los suma cada minuto. Sirve para revisar más adelante si la dificultad de una
-- pregunta es la que le toca. Solo el backend (service_role) la lee y escribe: RLS activado y sin políticas.
create table if not exists public.question_stats (
  game         text not null,                           -- opciones, musica, mundo, historia, minas, lluvia, rey, farsante
  question_id  text not null,                           -- id de la pregunta, canción, verso o tablero
  variant      text not null default '',
  prompt       text,                                    -- el texto, para leerla sin buscarla
  difficulty   text,                                    -- la dificultad que tenía cuando se jugó
  category     text,
  seen         integer not null default 0,              -- veces que salió
  players      integer not null default 0,              -- personas que la tuvieron delante (suma de todas las veces)
  correct      integer not null default 0,              -- acertaron
  wrong        integer not null default 0,              -- fallaron
  skipped      integer not null default 0,              -- la saltaron ("Saltar")
  blank        integer not null default 0,              -- se acabó el tiempo sin responder
  points       bigint not null default 0,               -- puntos que dio, sumados
  correct_ms   bigint not null default 0,               -- milisegundos que tardaron los aciertos, sumados
  extra        jsonb not null default '{}'::jsonb,      -- lo propio de cada juego (opciones elegidas, km, casillas…)
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (game, question_id, variant)
);
alter table public.question_stats enable row level security;

-- La tabla shared_playlists (las playlists de juegos compartidas por código) ya no se usa: se quitó el juego Playlist.
drop table if exists public.shared_playlists;

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

-- ---------------------------------------------------------------------------
-- Respuestas de servicios externos que se piden pocas veces y se guardan aquí para que reiniciar el servidor no las
-- vuelva a pedir. Hoy: el top 100 de Lynz (key 'lynz-top-songs'), que solo responde 2 peticiones por semana. `data`
-- guarda { songs, fetchedAt, requests } y `fetched_at` cuándo se leyó. Solo el backend lee y escribe.
-- ---------------------------------------------------------------------------
create table if not exists public.feed_cache (
  key         text primary key,
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);
alter table public.feed_cache enable row level security;
