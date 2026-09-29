import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        bypass: (req) => {
          if (req.url && req.url.startsWith("/auth")) {
            return false;
          }
        },
      },
      "/socket.io": {
        target: "http://127.0.0.1:8787",
        ws: true,
        configure: (proxy) => {
          proxy.on("error", (err) => {
            if (err.code !== "ECONNRESET") {
              console.warn("Socket proxy error:", err.message);
            }
          });
        },
      },
    },
  },
});
