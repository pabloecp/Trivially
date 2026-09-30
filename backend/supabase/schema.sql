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
