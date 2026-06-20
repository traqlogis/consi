import { defineConfig, loadEnv } from "vite"; 
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import flowbiteReact from "flowbite-react/plugin/vite";


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_API_URL || "http://localhost:4000";

  return {
    plugins: [react(), tailwindcss(), flowbiteReact()],
    server: {
      watch: {
        ignored: ['**/src/backend/data-file.json']
      },
      proxy: {
        "/api": {
          target: backendTarget, 
          changeOrigin: true,
          // rewrite: (path) => path.replace(/^\/api/, ''),
        },
        "/socket.io": {
          target: backendTarget, 
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});