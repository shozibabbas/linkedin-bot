const { defineConfig } = require("vite");
const path = require("node:path");

module.exports = defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
