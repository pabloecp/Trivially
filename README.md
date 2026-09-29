# Trivially ⚡

Plataforma interactiva de trivia musical en tiempo real con buscador predictivo inteligente. Pon a prueba tu oído reconociendo canciones solo o compitiendo con amigos en salas multijugador en vivo.

---

## 🌐 Enlaces de Producción

- **Frontend (Vercel)**: [https://triviallyonline.vercel.app](https://triviallyonline.vercel.app/)
- **Backend API (Railway)**: [https://trivially-production.up.railway.app](https://trivially-production.up.railway.app) *(Puerto 8080)*

---

## ✨ Características Principales

- **🎮 Modos de Juego**:
  - **Individual**: Entrena tu oído musical reconociendo y escribiendo canciones contra reloj.
  - **Multijugador en Vivo**: Crea salas privadas con código `XO····` (ej. `XO4K9M`), comparte el enlace, invita amigos y compite en tiempo real sincronizado por WebSockets.
- **🔍 Buscador Predictivo con Slide Bar**:
  - Escribe el título de la canción conforme la escuchas (ej. al escribir `Bue`, se despliegan sugerencias como `Buenas`).
  - Navega con las flechas del teclado (`↑` / `↓`) y pulsa `Enter` para seleccionarla al instante, o haz clic en cualquier sugerencia.
- **🔊 Audio Streaming Inmediato**:
  - Fragmentos de audio de alta calidad para todas las canciones sin cortes ni silencios.
- **🔐 Autenticación Flexible**:
  - Invitado instantáneo, correo/contraseña y login con **Google OAuth**.
- **🌓 Modo Oscuro y Modo Claro**:
  - Tema oscuro de alta fidelidad y tema claro con selector persistente.
- **🎨 Interfaz Dinámica**:
  - Visualizador sónico animado y ecualizador en tiempo real.
  - Podio dinámico de ganadores, estadísticas de racha y desglose detallado de la partida.
- **🏆 Leaderboard y Perfiles**:
  - Puntuaciones acumuladas, estadísticas por jugador, precisión y mejores rachas.

---

## 🚀 Requisitos Previos

- **Node.js** 18.x o superior
- **npm** 9.x o superior

---

## 🛠️ Instalación y Puesta en Marcha

1. **Clonar el repositorio:**
   ```bash
   git clone <URL_DE_TU_REPOSITORIO>
   cd Trivially
   ```

2. **Instalar dependencias (raíz, backend y frontend):**
   ```bash
   npm run install:all
   ```

3. **Variables de entorno:**
   Copia el archivo `.env.example` tanto en la raíz como en `backend/.env`:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

   **Configuración para Backend (`.env` o `backend/.env`):**
   ```env
   PORT=8080
   CLIENT_ORIGIN=https://triviallyonline.vercel.app
   SESSION_SECRET=tu-clave-secreta-de-sesion

   # Google OAuth (Opcional)
   GOOGLE_CLIENT_ID=tu_google_client_id
   GOOGLE_CLIENT_SECRET=tu_google_client_secret
   GOOGLE_REDIRECT_URI=https://triviallyonline.vercel.app/auth/google/callback
   ```

   **Configuración para Frontend (`frontend/.env`):**
   ```env
   VITE_API_URL=https://trivially-production.up.railway.app
   ```

4. **Iniciar en modo desarrollo:**
   ```bash
   npm run dev
   ```
   - **Frontend**: [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:8080](http://localhost:8080)

---

## 📁 Estructura del Proyecto

```text
Trivially/
├── backend/
│   ├── data/             # Base de datos persistente local (store.json)
│   ├── src/
│   │   ├── auth/         # Autenticación, sesiones y Google OAuth
│   │   ├── catalog/      # Gestor de catálogo y selector de canciones
│   │   ├── db/           # Adaptador de almacenamiento y usuarios
│   │   ├── game/         # Lógica de salas (códigos XO), autocompletado y puntuación
│   │   └── realtime/     # Servidor Socket.IO para sincronización en tiempo real
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── public/           # Activos estáticos, logos e imágenes de artistas
│   ├── src/
│   │   ├── components/   # Componentes modulares (Navbar, Modales, YoavllySymbol)
│   │   ├── pages/        # Vistas principales (Home, Setup, Lobby, Game, Leaderboard, etc.)
│   │   ├── styles/       # Sistema de diseño, temas claro/oscuro y animaciones
│   │   └── lib/          # Estado global (store), cliente Socket.IO y API
│   ├── .env.example
│   ├── vercel.json       # Configuración de enrutamiento SPA para Vercel
│   └── package.json
├── .env.example
└── package.json
```

---

## 📄 Licencia

MIT 