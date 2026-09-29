// URL base del backend. En producción apunta a Railway.
// En desarrollo local (DEV), utiliza cadena vacía para aprovechar el proxy de Vite (localhost:8080).
const envApiUrl = import.meta.env.VITE_API_URL;
const isDev = import.meta.env.DEV;

// In production on Vercel, use "" so requests go through Vercel rewrites (same-origin → cookies work).
// Only use the direct Railway URL if explicitly set via VITE_API_URL.
export const BACKEND_URL = (
  isDev ? "" : (envApiUrl || "")
).replace(/\/$/, "");
