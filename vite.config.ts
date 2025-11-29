import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: ["./", "./client", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },

  build: {
    outDir: "dist/spa",
    rollupOptions: {
      external: ["@google/generative-ai"],
    },
  },

  // 🚫 Prevent Vite from scanning Gemini
  optimizeDeps: {
    exclude: ["@google/generative-ai"],
  },

  // 🚫 Prevent Vite SSR from touching Gemini
  ssr: {
    external: ["@google/generative-ai"],
  },

  plugins: [react(), expressPlugin()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});

function expressPlugin() {
  return {
    name: "express-plugin",
    apply: "serve",
    configureServer(viteServer) {
      console.log("Vite plugin loaded");

      const app = createServer(); // your Express app
      console.log("Express app:", typeof app);

      // ✔ FIX: Use Vite 7 compatible middleware wrapper
      viteServer.middlewares.use((req, res, next) => {
        app(req, res, next);
      });
    },
  };
}
