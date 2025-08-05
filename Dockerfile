# Dockerfile para Render.com - Memory Optimized
FROM node:18-slim

# Instalar apenas dependências essenciais (reduzir overhead)
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Criar diretório de trabalho
WORKDIR /app

# Criar diretório persistente para sessões WhatsApp
RUN mkdir -p /data/wweb-session && \
    chmod -R 777 /data/wweb-session

# Copiar package.json e instalar dependências
COPY package.json ./
RUN npm install --omit=dev --no-cache

# Copiar código da aplicação
COPY . .

# Definir variáveis de ambiente para otimização de memória
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV WWEB_SESSION_PATH=/data/wweb-session
ENV NODE_OPTIONS="--max-old-space-size=256 --expose-gc"
ENV PUPPETEER_TIMEOUT=0

# Expor porta
EXPOSE 10000

# Comando de inicialização com otimização de memória
CMD ["npm", "start"]