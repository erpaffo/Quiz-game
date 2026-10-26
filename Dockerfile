# ==============================================================================
# Dockerfile Multi-Architettura (compatibile con Raspberry Pi ARM64 e PC x86_64)
# ==============================================================================
FROM node:22-alpine

WORKDIR /app

# Evita di scaricare i binari pesanti di Electron (~100MB) sul Raspberry Pi:
# sul server ci serve solo il backend Node.js + la Web App compilata con Vite.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# 1. Installa le dipendenze sfruttando la cache dei layer Docker
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Copia il codice sorgente e compila la Web App (incluso il setup MediaPipe)
COPY . .
RUN npm run build

# Crea le cartelle per i dati persistenti (pacchetti domande utenti e media)
RUN mkdir -p /app/user-packs /app/user-media

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Avvia il server Express + Socket.IO in modalità produzione
CMD ["npm", "start"]

