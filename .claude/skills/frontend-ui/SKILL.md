---
name: frontend-ui
description: Buenas prácticas de UI para el frontend React de Trivially (estructura de componentes, estados, responsive, accesibilidad, rendimiento). Úsala al crear o modificar componentes y pantallas; combínala con trivially-design para el aspecto visual.
---

# Frontend UI (React + Vite)

Complementa a `trivially-design` (que define cómo se ve). Esta define cómo se construye. JavaScript ESM, sin TypeScript. Textos de interfaz en español.

## Estructura

- Pantallas en `frontend/src/pages/` y `frontend/src/modes/<modo>/`; piezas reutilizables en `frontend/src/components/` (Home en `components/home/`).
- Estado global (usuario, sala, socket) desde `useApp()` en `lib/store.jsx`; no dupliques ese estado en componentes.
- Llamadas HTTP con `lib/api.js`, tiempo real con `lib/socket.js`. No uses `fetch` directo al backend.
- Un componente por archivo, nombres en PascalCase; lógica pesada fuera del JSX (funciones o hooks).
- Rutas en `App.jsx`. Una pantalla que va en una sala debe soportar recarga: se une sola a la sala del código de la URL.

## Estados de cada pantalla

Siempre cubre: cargando, vacío, error y éxito. Sin datos de sala aún → mensaje "Conectando…"; error de red → mensaje en español legible, nunca el error crudo. Deshabilita botones mientras una acción está en curso (`disabled` + estado).

## Responsive

- Móvil primero: una columna por defecto, y dos o más columnas desde `min-width: 860px` o `900px`.
- Sin scroll horizontal; usa `min-width: 0` en hijos de grid/flex con texto largo.
- Objetivos táctiles de al menos 44px. Respeta `env(safe-area-inset-*)` en barras fijas.

## Accesibilidad

- Elementos interactivos son `<button>` o `<a>`, nunca `<div onClick>`.
- Botones de solo ícono con `aria-label`; regiones dinámicas (toasts) con `role="status"` y `aria-live="polite"`.
- Foco visible y orden de tabulación lógico; los diálogos atrapan el foco y cierran con Escape.
- No transmitas información solo con color (acierto/error llevan también texto o ícono).
- Animaciones desactivables con `prefers-reduced-motion`.

## Rendimiento y limpieza

- Limpia efectos: `clearTimeout`/`clearInterval`, listeners y sockets en el `return` del `useEffect`.
- Dependencias de `useEffect` correctas; evita bucles de render.
- Imágenes con `alt`, `loading="lazy"` y un `onError` de respaldo cuando la URL es externa.
- No guardes secretos en el frontend: solo la clave pública; las claves privadas (Supabase secret, Google secret) viven en el backend.

## Antes de dar algo por terminado

1. `npm run build --prefix frontend` sin errores.
2. Revisa la pantalla en móvil (≈390px) y escritorio, modo claro y oscuro.
3. Prueba los estados vacío/error/cargando y el flujo con teclado.
