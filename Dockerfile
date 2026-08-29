# --- Build stage ---
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage ---
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p uploads && addgroup -S pawtato && adduser -S pawtato -G pawtato \
  && chown -R pawtato:pawtato /app
USER pawtato

EXPOSE 5000

# Hits the real liveness route; relies on PORT/API_PREFIX defaults (5000/api) —
# override both args here if those env defaults ever change.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get({ host: 'localhost', port: process.env.PORT || 5000, path: '/' + (process.env.API_PREFIX || 'api') + '/health' }, (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
