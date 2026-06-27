import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Accessible depuis le LAN ou internet
    host: true,
    port: 80,
  },
});
