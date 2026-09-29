// URL base del backend. En producción o si se define VITE_API_URL, apunta a Railway.
// En desarrollo local sin VITE_API_URL, utiliza cadena vacía para aprovechar el proxy de Vite.
const envApiUrl = import.meta.env.VITE_API_URL;
const isProd = import.meta.env.PROD;

export const BACKEND_URL = (
  envApiUrl || (isProd ? "https://trivially-production.up.railway.app" : "")
).replace(/\/$/, "");
