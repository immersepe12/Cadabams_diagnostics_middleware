import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In production the API and SPA share one origin (single Vercel deployment).
// In dev, proxy API paths to the local Hono server (bun run dev → :3000).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/sync": "http://localhost:3000",
      "/bookings": "http://localhost:3000",
      "/catalogue": "http://localhost:3000",
      "/webhook": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/data": "http://localhost:3000",
      "/actions": "http://localhost:3000",
      // Patient-portal backend (PDF signing, SMS hook). Note: /api/* — the SPA
      // owns /portal/* as client-side routes, so the API must not shadow them.
      "/api": "http://localhost:3000",
    },
  },
});
