FROM node:22-bookworm-slim AS build
# imagemagick: build:assets (postinstall + build) usa `convert` para generar favicons/og-image.
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
# postinstall corre build-assets.mjs (necesita logo.svg) + nuxt prepare (necesita
# el resto del árbol) — sin split de capa deps-only, todo el repo antes de instalar.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV NITRO_PORT=3000 NITRO_HOST=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", ".output/server/index.mjs"]
