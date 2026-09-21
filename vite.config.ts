import { defineConfig } from "vite";
export default defineConfig({
  server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes("node_modules/three/") ||
          id.includes("node_modules/@react-three/")
            ? "three"
            : undefined,
      },
    },
  },
});
