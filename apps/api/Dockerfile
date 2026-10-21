# Tutor NeoVim API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t tutor-nvim-api .
#
# The workspace packages export TypeScript source and the API runs through tsx (no compile step), so
# the image holds the sources it imports plus production dependencies only. Dev dependencies (PGlite,
# drizzle-kit, test tooling) are left out: production always has DATABASE_URL (see config.ts).
FROM node:22-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/vim-engine/package.json packages/vim-engine/
COPY packages/exercise-schema/package.json packages/exercise-schema/
COPY packages/evaluation/package.json packages/evaluation/
COPY packages/pedagogy/package.json packages/pedagogy/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @tutor-nvim/api...

FROM node:22-slim
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY content ./content
# The platform's user, not root.
USER node
EXPOSE 8787
WORKDIR /app/apps/api
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "src/server.ts"]
