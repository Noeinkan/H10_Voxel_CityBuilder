# voxelcity — costruisce il bundle statico, poi lo serve da un'immagine minima.
# Multi-stage: nel container che affaccia su internet non arrivano toolchain,
# node_modules né tracce dell'ambiente di build.
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS build
ARG BUILD_COMMAND="npm run build"
ARG OUTPUT_DIR="dist"
WORKDIR /src
COPY repo/ /src/
# Install esatto da lockfile quando c'è; fallback per le repo che non lo hanno.
RUN if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi
RUN sh -c "${BUILD_COMMAND}"
RUN cp -r "${OUTPUT_DIR}" /out

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /out /usr/share/nginx/html
EXPOSE 8080
