import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Uncommon defaults avoid colliding with other local projects; override per-shell
// (e.g. CC_STUDIO_API_PORT=5001 CC_STUDIO_WEB_PORT=5002 bun run dev) to run several copies.
const WEB_PORT = Number(process.env.CC_STUDIO_WEB_PORT ?? 47821);
const API_PORT = Number(process.env.CC_STUDIO_API_PORT ?? 47820);

export default {
  plugins: [...react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
};
