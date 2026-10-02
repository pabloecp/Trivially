---
name: trivially-design
description: Reglas de diseño del frontend de Trivially (paleta rosa/amarillo, color por modo de juego, estilo chunky con resorte, TvShell). Úsala al crear o cambiar cualquier pantalla, componente o estilo del frontend.
---

# Diseño de Trivially

Estilo: entre app y web. Tarjetas y botones redondeados y "gordos" (sombra sólida abajo, se hunden al presionar), movimiento con resorte, pero páginas amplias y barra superior como un sitio. Todo el texto de la interfaz va en español.

## Paleta

Cinco colores planos, sin degradados raros. Definidos como `--p-*` al inicio de `frontend/src/styles/home.css` (cada uno con tono claro `-1`, principal `-2` y borde `-edge` para la sombra gruesa):

- **Violeta** `#6A40E6` (en oscuro `#A58BFF`): el color del sitio (botones principales, enlaces, pestañas).
- **Sol (amarillo)** `#FFC52E`: segundo color (chips, botón Invitar, avisos, foco).
- **Verde** `#1DB954`: modo Adivina la canción (y aciertos).
- **Celeste** `#2EA8FF`: modo Geografía.
- **Coral** `#FF6A55`: modo Cine y series.
- Cultura general usa el amarillo. Texto sobre amarillo, verde, celeste y coral va oscuro (`#1D1A33`); sobre violeta va blanco.
- **Neutros**: oscuro = índigo (`#231F3D`, superficies `#2E2A50`/`#3A3562`, texto blanco); claro = crema (`#FFF4E3`, superficies blancas, texto `#1D1A33`). Oscuro es el tema por defecto (`trivially_theme`).
- Errores en rojo y aciertos en verde son semánticos: no los cambies por colores de marca.
- Movimiento de color: cinco globos de colores flotan detrás de todo (`.tv-blob--1..5`) y el logo cambia de color sin parar (matiz del icono con `--logo-h`, letras con `tvLetterColors`). Con un modo elegido, el fondo se pinta del color del modo y los globos se ven suaves encima.

## Cómo se aplica

- Tokens globales en `frontend/src/styles/global.css` (`--brand`, `--brand-rgb`, `--on-brand`, `--accent`, `--bg*`, `--text*`). Usa `rgba(var(--brand-rgb), a)` en vez de colores fijos.
- El color de un modo se activa con `data-mode` en `<html>` (`:root[data-mode="musica"]`). Un modo nuevo = un bloque nuevo ahí + entrada en `frontend/src/modes/index.js` (color de la tarjeta: clases `.tv-c-*` en `home.css`).
- Estilo del home y pantallas de sala/juego/perfil en `frontend/src/styles/home.css` (prefijo `tv-`, variables `--tv-*`).
- Las pantallas de un modo o el perfil se envuelven en `components/home/TvShell.jsx` (`<TvShell mode="musica">`). Dentro de `.tv-app`, las clases viejas (`card`, `btn`, `field`) se re-estilizan solas.
- No existe `/play`: todo empieza en Home (`/`), la sala se crea desde el botón Jugar (PlaySheet).

## Reglas de componentes

- Botones: `tv-btn` + clase de color (`tv-c-green`, `tv-c-violet`, `tv-c-neutral`…), altura 46px, radio 16, sombra `0 4px 0 var(--edge)`, `hover` sube 2px, `active` baja 4px.
- Tarjetas: `tv-card` (radio 30, sombra sólida, animación `tvRise`).
- Tarjetas de modo: oscuras por defecto; al pasar el mouse se llenan del color del modo, con ícono/botón en blanco y sombra de color debajo. Sin contorno.
- Fuentes: títulos y botones `Fredoka`/`Outfit`, texto `Nunito`/`Plus Jakarta Sans`.
- Animaciones: resorte `cubic-bezier(0.34, 1.56, 0.64, 1)`, entradas `tvRise`. Siempre respeta `prefers-reduced-motion`.
- Accesibilidad: foco visible (`--tv-focus`), contraste suficiente, `aria-label` en botones de solo ícono.

## Al terminar

Corre `npm run build --prefix frontend` y revisa la pantalla en modo claro y oscuro y en ancho de móvil.
