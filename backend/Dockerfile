# Repto backend - AdSpy scraper. Build from repo root: docker build -f backend/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

# Copy backend and shared src types (backend imports from ../../src/lib/adspy/types)
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev

COPY backend backend
COPY src src

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "src/server.ts"]
