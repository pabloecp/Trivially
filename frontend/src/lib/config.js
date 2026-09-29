// URL base del backend. En producción apunta a Railway.
// En desarrollo local (DEV), utiliza cadena vacía para aprovechar el proxy de Vite (localhost:8080).
const envApiUrl = import.meta.env.VITE_API_URL;
const isDev = import.meta.env.DEV;

export const BACKEND_URL = (
  isDev ? "" : (envApiUrl || "https://trivially-production.up.railway.app")
).replace(/\/$/, "");
