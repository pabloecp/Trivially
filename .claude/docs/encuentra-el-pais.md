# Encuentra el país (id `mundo`, `GEO_GAME`)

Every round each player pins a country on the world map.

- **Modos de juego** (`config.geo.styles`, `GEO_STYLES`): `nombre` (its name), `sombra` (its silhouette), `bandera` (its flag). `pickGeoQuestions` shares the rounds between them; all are map rounds (`toMapRound`).
- `config.geo`: `rounds` 5–25, `roundMs` 15–35 s (steps of 5), `styles`, `difficulties`; an empty list blocks the start. Logic in `game/geo.js` (`countGeoQuestions`, never two questions on one country).
- **Questions:** `geo/countries.js` (194 countries) → `geo/geoQuestions.js` (stable uuids; `reject` gets other countries' answers the typo tolerance would accept). `geo:upload` upserts and deletes stale `mundo` rows. `geoBank()` fills anything Supabase lacks from `countries.js`. The written capitals and flags are only played in Trivia (`isCorrectOpenAnswer` in `game/openAnswers.js`; extra names in `geo/otherNames.js`).
- **Pictures by random token** so the URL never names the country: `/api/geo/flag/<token>` (`geo/flags.js`, from flagcdn, cached) and `/api/geo/shape/<token>` (`geo/shapes.js` `countryShape`: far-off pieces dropped by `NEAR_KM`; `hasShape` excludes useless silhouettes). `withGeoTokens` sets them.
- **Pins:** socket `game:pin` `{ lng, lat, lock }` (`placePin`); movable until locked, the last one counts. `gradeMap()` uses `geo/worldMap.js` `locate()` on the same `world-atlas` 50m file as the client: inside (`INSIDE_TOLERANCE_KM`) 1000, outside fewer by distance.
- **Tiebreak** (`beginTiebreak`, `room.tiebreak`): a map round only the tied play; the first confirmed pin inside wins, else the closest; up to `MAX_TIEBREAKS` (3). No points; `tiebreakWinner` goes first.
- `publicState`: kind and style in the countdown; while playing the name, or only the shape/flag URL; the answer at the reveal, with each pin's distance in `lastAnswer`.
- **Frontend** `modes/mundo/` (`Game.jsx`, `WorldMap.jsx`, `worldData.js`, `GeoSettings.jsx`), styles `styles/geo.css`. One fixed frame (`.tv-geo-stage`, `--geo-top`), the same `WorldMap` all match (`resetKey`), the verdict as a card over the map, the clue card bottom left (`.tv-geo-clue-area` size container). Below 900 px: `html.tv-geo-playing` (no top bar, no page scroll).
