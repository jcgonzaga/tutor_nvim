import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        /**
         * The Spanish interface catalog is one asset of its own (T-902): only the dynamic import in
         * `src/i18n/catalogs.ts` reaches it, and nothing else lives in that chunk, so a learner who
         * does not read Spanish never fetches it. The name is fixed so `tests/perf` can watch for
         * the request in a real browser. The content overlay is left to the bundler: forcing it into
         * a named chunk would pull the shared modules it depends on (the source content, the YAML
         * and schema parsers) out of the entry and back into an eagerly preloaded chunk.
         */
        manualChunks: (id) => (/\/i18n\/es\//.test(id) ? "catalog-es" : undefined),
      },
    },
  },
});
