# syntax=docker/dockerfile:1

# ---------- Stage 1: build the website ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Stage 2: serve it with Caddy (the Caddyfile is mounted by docker-compose) ----------
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
