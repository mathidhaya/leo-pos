# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# The Prisma config asks for a database address, but making the client does not connect to anything
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
RUN npm run build

# ---------- Stage 2: run ----------
FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Only what is needed to update the database tables and run the app
COPY prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY --from=build /app/dist ./dist

# Uploaded images live here. docker-compose keeps this folder in a volume so updates do not lose them.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 5000
# On every start: bring the database tables up to date, then run the app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
