# voxelcity — costruisce il bundle statico, poi lo serve da un'immagine minima.
# Multi-stage: nel container che affaccia su internet non arrivano toolchain,
# node_modules né tracce dell'ambiente di build.
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS build
ARG BUILD_COMMAND="npm run build"
ARG OUTPUT_DIR="dist"
# Le due sole informazioni che il bundle deve conoscere di Supabase.
#
# Sono **argomenti di build e non segreti**: l'URL del progetto e la chiave
# pubblicabile finiscono per forza dentro il file JavaScript che il browser
# scarica, perche' e' il browser a parlare con Supabase. A proteggere i dati e'
# la Row Level Security, non il fatto che la chiave resti nascosta — e infatti
# non resta nascosta.
#
# A darle e' `compose.yml`, che le prende dal `.env` del sito sul server. Vuote
# per difetto: senza di loro il build riesce lo stesso, e la pagina dice che
# l'accesso non e' configurato invece di non partire.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
# "off" salta la porta degli account: lo decide compose.yml, non il server.
ARG VITE_AUTH_GATE=""
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
