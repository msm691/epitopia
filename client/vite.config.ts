import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Accessible depuis le LAN (utile dès l'Étape 3, sans danger avant).
    host: true,
  },
});
