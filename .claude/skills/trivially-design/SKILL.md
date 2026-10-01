---
name: trivially-design
description: Reglas de diseño del frontend de Trivially (paleta rosa/amarillo, color por modo de juego, estilo chunky con resorte, TvShell). Úsala al crear o cambiar cualquier pantalla, componente o estilo del frontend.
---

# Diseño de Trivially

Estilo: entre app y web. Tarjetas y botones redondeados y "gordos" (sombra sólida abajo, se hunden al presionar), movimiento con resorte, pero páginas amplias y barra superior como un sitio. Todo el texto de la interfaz va en español.

## Paleta

- **Sitio**: rosa `#F050AE` (hover `#F46CBD`, activo `#D93C99`) + amarillo `#FDF148` como segundo color (chips, pestaña/enlace activo, botones secundarios, un punto del logo).
- **Neutros**: modo claro blanco (`#FFFFFF`, superficies `#F5F5F5`, texto `#0A0A0A`); modo oscuro negro (`#0A0A0A`, superficies `#161616`/`#232323`, texto blanco). Oscuro es el tema por defecto (`trivially_theme`).
- **Color por modo de juego** (cada modo cambia el color principal del sitio):
  - Adivina la canción → verde Spotify `#1DB954` (con el modo elegido, todo el fondo es de este color)
  - Cultura general → naranja `#FFAB00`
  - Cine y series → morado `#9336FD`
  - Geografía → turquesa `#33A8C7`
  - Extras de la paleta: Neon Ice `#52E3E1`, Grapefruit `#F77976`, Mauve `#D883FF` (avatares, fondos).
- Aciertos en verde y errores en rojo son semánticos: no los cambies por colores de marca.
- Texto sobre verde/naranja/turquesa/amarillo va oscuro (`#0A0A0A`); sobre rosa/morado va blanco.

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
