# Dockerfile para Render.com - Target Closed Fix
FROM node:18-slim

# Instalar dependências do sistema para Chromium + correções Target closed
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Criar diretório persistente para sessões WhatsApp
RUN mkdir -p /data/wweb-session && \
    chmod -R 777 /data/wweb-session

# Copiar package.json e instalar dependências
COPY package.json ./
RUN npm install --omit=dev

# Copiar código da aplicação
COPY . .

# Definir variáveis de ambiente para Target closed fix
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV WWEB_SESSION_PATH=/data/wweb-session
ENV PUPPETEER_TIMEOUT=0

# Expor porta
EXPOSE 10000

# Comando de inicialização
CMD ["npm", "start"]