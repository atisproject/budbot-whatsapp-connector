# BudBot WhatsApp Connector v5.0 - Production Ready Dockerfile
# Optimized for Render.com deployment with full Chromium support

FROM node:18-slim

# Set labels for maintainability
LABEL version="5.0.0"
LABEL description="BudBot WhatsApp Connector - Complete Integration"
LABEL maintainer="BudBot Team"

# Install system dependencies including Chromium and debugging tools
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/cache/apt/*

# Create app directory with proper permissions
WORKDIR /app

# Create non-root user for security
RUN groupadd -r budbot && useradd -r -g budbot -d /app -s /sbin/nologin budbot

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install Node.js dependencies
# Using npm install for better compatibility with Render.com
RUN npm install --omit=dev --no-audit --no-fund --verbose \
    && npm cache clean --force

# Copy application files
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p wweb_session logs \
    && chown -R budbot:budbot /app \
    && chmod -R 755 /app

# Set environment variables for Puppeteer and Node.js
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512" \
    CHROME_BIN=/usr/bin/chromium \
    DISPLAY=:99

# Expose port
EXPOSE 3000

# Health check with comprehensive validation
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Switch to non-root user
USER budbot

# Start application with proper signal handling
CMD ["node", "index.js"]