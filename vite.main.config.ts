import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/main",
    emptyOutDir: false,
    sourcemap: true,
    target: "node24",
    lib: {
      entry: {
        main: "src/main/main.ts",
        preload: "src/main/preload.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^node:/, "electron", "electron-updater"],
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
