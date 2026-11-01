# Trivially ⚡

Juego de trivia en tiempo real, solo o con amigos en salas privadas con un código de cinco letras y números, o en partidas públicas con gente de todas partes.

---

## 🌐 Enlaces de producción

- **Página (Vercel)**: [https://triviallyonline.vercel.app](https://triviallyonline.vercel.app/)
- **Servidor (Railway)**: [https://trivially-production.up.railway.app](https://trivially-production.up.railway.app)

---

## 🎮 Juegos

- **Trivia**: preguntas de todos los temas, eligiendo entre cuatro opciones o escribiendo la respuesta.
- **Adivina la canción**: escucha 30 segundos de una canción y elige o escribe su título.
- **Encuentra el país**: pon un pin en el mapa del mundo; el país se da por su nombre, su silueta o su bandera.
- **Rango**: acércate lo más posible al año de un suceso en una línea del tiempo, o a un número en una barra.
- **Campo de minas**: un tablero de respuestas donde algunas son minas, por turnos o en carrera.
- **Lluvia**: las preguntas caen por la pantalla y cada una es de quien la responda primero.
- **Rey de la colina**: el rey elige la pregunta y el primero que la responde se queda con la corona.
- **Farsante**: un juego para una llamada: todos inventan una respuesta y después votan.

Además:

- **Partidas públicas**: Casual junta jugadores de todas partes para jugar dos juegos al azar.
- **Clásico**: Normal y Extendido llevan una partida pública a una sala privada, con sus propios jugadores.
- **Playlists**: varios juegos seguidos, cada uno con sus ajustes, guardados y compartidos con un código.
- **Dispositivo central**: una pantalla (una tele, una laptop) muestra la partida y cada jugador responde desde su teléfono.
- **Cuentas**: invitado al instante, correo y contraseña, o Google. Hay perfil con estadísticas, historial de partidas y amigos.

---

## 🚀 Requisitos

- **Node.js** 18 o superior
- **npm** 9 o superior

---

## 🛠️ Puesta en marcha

1. **Instalar dependencias (servidor y página):**
   ```bash
   npm run install:all
   ```

2. **Variables de entorno:** copiar los ejemplos.
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
   En local, `VITE_API_URL` se deja vacío: Vite pasa las llamadas al servidor en `http://127.0.0.1:8080`. Google, Spotify y Supabase son opcionales; sin Supabase, las preguntas salen de archivos locales.

3. **Arrancar:**
   ```bash
   npm run dev
   ```
   - **Página**: [http://localhost:5173](http://localhost:5173)
   - **Servidor**: [http://localhost:8080](http://localhost:8080)

4. **Pruebas del servidor:**
   ```bash
   npm test --prefix backend
   ```

---

## 📁 Estructura

```text
Trivially/
├── backend/
│   ├── data/             # Cuentas y estadísticas en local (store.json)
│   ├── scripts/          # Subir preguntas, canciones y tableros a Supabase
│   ├── supabase/         # Esquema de la base de datos
│   └── src/
│       ├── auth/         # Cuentas, sesiones y Google
│       ├── catalog/      # Canciones de Adivina la canción
│       ├── db/           # Guardado de cuentas, reportes y playlists compartidas
│       ├── friends/      # Amigos e invitaciones
│       ├── game/         # Salas, partidas, puntos y las reglas de cada juego
│       ├── geo/          # Países, mapa, siluetas y banderas
│       ├── history/      # Sucesos y cifras de Rango
│       ├── mines/        # Tableros de Campo de minas
│       ├── farsante/     # Frases de Farsante
│       ├── questions/    # Banco de preguntas
│       ├── moderation/   # Filtro de enlaces
│       └── realtime/     # Socket.IO: la partida en vivo
├── frontend/
│   ├── public/           # Íconos y manifiesto de la app
│   └── src/
│       ├── components/   # Piezas de la interfaz (components/home)
│       ├── modes/        # Una carpeta por juego, más playlist y Clásico
│       ├── pages/        # Inicio, inicio de sesión y perfil
│       ├── styles/       # Estilos: los generales y uno por juego
│       └── lib/          # Estado, cliente de Socket.IO, sonidos y API
├── scripts/dev.mjs       # Lo que corre "npm run dev"
└── CLAUDE.md             # Cómo funciona todo, en detalle
```

---

## 🌿 Cómo contribuir

Trabajamos con Git Flow: `main` es producción, `develop` es donde se junta lo nuevo y cada cambio va en su propia rama (`feature/`, `fix/`, `chore/`) con un pull request hacia `develop`. Los detalles están en [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📄 Licencia

MIT
