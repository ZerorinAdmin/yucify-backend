# Repto backend - AdSpy scraper. Build from repo root: docker build -f backend/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app

# ffmpeg is used to extract the first 0–5s audio from ad videos for transcription.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy backend (self-contained with adspy lib)
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev

COPY backend backend

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "src/server.ts"]
