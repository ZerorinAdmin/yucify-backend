# Repto backend - AdSpy scraper. Build from repo root: docker build -f backend/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app

# Copy backend (self-contained with adspy lib)
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev

COPY backend backend

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "src/server.ts"]
