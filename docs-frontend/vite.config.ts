import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import preserveFiles from "./vite/preserveFiles";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    preserveFiles({
      files: ["CNAME"],
    }),
  ],
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
});
