# YOAVLLY ⚡

Plataforma interactiva de trivia musical en tiempo real con buscador predictivo inteligente. Pon a prueba tu oído reconociendo canciones solo o compitiendo con amigos en salas multijugador en vivo.

---

## ✨ Características Principales

- **🎮 Modos de Juego**:
  - **Individual**: Entrena tu oído musical escribiendo canciones contra reloj.
  - **Multijugador en Vivo**: Crea salas privadas con código `XO····` (ej. `XO4K9M`), comparte el enlace, invita amigos y compite en tiempo real.
- **🔍 Buscador Predictivo con Slide Bar**:
  - Escribe el título de la canción conforme la escuchas (ej. al escribir `Bue`, se despliegan sugerencias como `Buenas`).
  - Navega con las flechas del teclado (`↑` / `↓`) y pulsa `Enter` para seleccionarla al instante, o haz clic en cualquier sugerencia.
- **🔊 Audio Streaming Inmediato**:
  - Fragmentos de audio de alta calidad para todas las canciones sin cortes ni silencios.
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
   cd YOAVLLY
   ```

2. **Instalar dependencias (raíz, backend y frontend):**
   ```bash
   npm run install:all
   ```

3. **Variables de entorno (Opcional):**
   Copia `.env.example` en la carpeta `backend/.env`:
   ```bash
   cp .env.example backend/.env
   ```
   Configura el puerto y origen si deseas personalizarlos:
   ```env
   PORT=8787
   CLIENT_ORIGIN=http://localhost:5173
   ```

4. **Iniciar en modo desarrollo:**
   ```bash
   npm run dev
   ```
   - **Frontend**: [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:8787](http://localhost:8787)

---

## 🧪 Pruebas Automatizadas

Para ejecutar la suite de pruebas unitarias del backend:

```bash
npm test --prefix backend
```

---

## 📁 Estructura del Proyecto

```text
YOAVLLY/
├── backend/
│   ├── data/             # Base de datos persistente local (store.json)
│   ├── src/
│   │   ├── auth/         # Autenticación, sesiones y Google OAuth
│   │   ├── catalog/      # Gestor de catálogo y selectores de canciones
│   │   ├── db/           # Adaptador de almacenamiento y usuarios
│   │   ├── game/         # Lógica de salas (códigos XO), autocompletado y puntuación
│   │   └── realtime/     # Servidor Socket.IO para sincronización en tiempo real
│   └── package.json
├── frontend/
│   ├── public/           # Activos estáticos, logos e iconos SVG
│   ├── src/
│   │   ├── components/   # Componentes modulares (Navbar, Modales, YoavllySymbol)
│   │   ├── pages/        # Vistas principales (Home, Setup, Lobby, Game, Leaderboard, etc.)
│   │   ├── styles/       # Sistema de diseño YOAVLLY, temas claro/oscuro y animaciones
│   │   └── lib/          # Estado global y cliente de Socket.IO / API
│   └── package.json
└── package.json
```

---

## 📄 Licencia

MIT
