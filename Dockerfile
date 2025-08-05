# Dockerfile Render Stable - Minimal
FROM node:18-slim

# Instalar APENAS Chromium essencial
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Criar diretório
WORKDIR /app

# Criar sessão persistente
RUN mkdir -p /data/wweb-session && chmod -R 777 /data/wweb-session

# Instalar deps
COPY package.json ./
RUN npm install --omit=dev --no-audit

# Copiar código
COPY . .

# Env vars mínimas
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV WWEB_SESSION_PATH=/data/wweb-session
ENV NODE_OPTIONS="--max-old-space-size=384"

EXPOSE 10000

CMD ["npm", "start"]