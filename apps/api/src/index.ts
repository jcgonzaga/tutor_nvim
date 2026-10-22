// Entry point Vercel detects for the API. The real server is bundled into dist/server.mjs by
// `pnpm --filter @tutor-nvim/api bundle` (see build-vercel.mjs and vercel.json); importing it here
// starts it. Not used by `dev`, `start` or the Docker image, which run src/server.ts.
import Fastify from "fastify";
import "../dist/server.mjs";

// Vercel only accepts an entry file that imports fastify; this file would otherwise not.
void Fastify;
