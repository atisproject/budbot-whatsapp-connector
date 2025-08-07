# BudBot WhatsApp Connector - Dockerfile otimizado para Render.com
FROM node:18-bullseye-slim

# Metadata
LABEL maintainer="BudBot-IA Team"
LABEL version="4.3.2"
LABEL description="BudBot WhatsApp Connector - Sistema inteligente de atendimento"

# Instalar dependências do sistema necessárias para Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libgconf-2-4 \
    libxtst6 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxss1 \
    libxrandr2 \
    libgconf-2-4 \
    libxss1 \
    libappindicator1 \
    fonts-liberation \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Instalar Chromium diretamente
RUN apt-get update && apt-get install -y \
    chromium \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Configurar usuário não-root para segurança
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json (se existir)
COPY package*.json ./

# Configurar npm para usar cache otimizado
RUN npm config set cache /tmp/.npm-cache --global

# Instalar dependências Node.js
RUN npm install --omit=dev --no-audit --no-fund

# Configurar Puppeteer para usar Chromium instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários e ajustar permissões
RUN mkdir -p /app/wweb_session /app/logs \
    && chown -R pptruser:pptruser /app

# Alterar para usuário não-root
USER pptruser

# Expor porta
EXPOSE 3000

# Configurar variáveis de ambiente de produção
ENV NODE_ENV=production
ENV PORT=3000
ENV WWEB_SESSION_PATH=/app/wweb_session

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Comando para iniciar a aplicação
CMD ["node", "index.js"]