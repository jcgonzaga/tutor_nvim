// Bundles the API for Vercel. Vercel compiles each .ts file on its own and Node's ESM loader then
// rejects the extensionless relative imports the codebase uses (`./errors`), so the function runs
// this single file instead. Third-party packages stay external (Vercel installs and traces them);
// only our code, including the workspace packages that export .ts, is bundled.
import { build } from "esbuild";

const externalizeThirdParty = {
  name: "externalize-third-party",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith("@tutor-nvim/") ? undefined : { path: args.path, external: true },
    );
  },
};

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  plugins: [externalizeThirdParty],
  logLevel: "info",
});
