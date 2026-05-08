# =========================================
# Stage 1: Build frontend (Vite)
# =========================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Force include devDependencies (vite, @vitejs/plugin-react)
RUN npm install --include=dev
COPY . .
RUN npx vite build

# =========================================
# Stage 2: Runtime with Playwright + Chromium
# Microsoft official Playwright image ships glibc + chromium-headless-shell preinstalled
# =========================================
FROM mcr.microsoft.com/playwright:v1.59.1-jammy
WORKDIR /app

ENV PORT=3010
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy build artefacts + server + manifest
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY package.json package-lock.json* ./

# Install runtime deps only. playwright now in `dependencies`, so --omit=dev keeps image lean (no vite).
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD reuses Chromium already in base image (saves ~150MB).
RUN npm install --omit=dev --omit=optional && npm cache clean --force

EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3010/api/health || exit 1

CMD ["node", "server/index.js"]
