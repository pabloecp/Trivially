# Question bank

- Supabase table `questions`, loaded once at boot by `questions/questionBank.js` `loadQuestions()` (active rows; else `backend/private/questions.json`; else the fake `sampleQuestions.js`) and passed to `RoomManager`. Each game filters by `mode`.
- Trivia's real questions are never committed (public repo). The table has RLS and no policies: only the service-role key reads it.
- Row (`questionSchema.js`, `supabase/schema.sql`): `id, type, mode, category, difficulty, language, prompt, data, active, created_at`.
  - `multiple_choice`: `{ options: [4], correct }`
  - `open`: `{ answer, aliases, reject }` (+ `flag`)
  - `location`: `{ name, map }` · `year`: `{ year }` (negative is BC, never 0) · `number`: `{ value, unit }`
  - `minefield`: `{ correct, wrong }`, 25 cells, 8–17 right. `true_false` is reserved.
  - New types need the `questions_type_check` constraint from `schema.sql`.
- Categories (`QUESTION_CATEGORIES`): `ciencia`, `historia`, `literatura`, `musica`, `arte`, `deportes`, `peliculas_series`, `videojuegos`, `geografia`, `cultura`.
- `questions:upload` validates the private file (all or nothing) and upserts by id, writing uuids back. `-- --check` only validates; `-- --prune` deletes rows not in the file, except modes `mundo`, `historia` and `minas` (their own upload scripts own them).
