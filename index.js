#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector v4.3
 * Render Stable - Minimal Approach
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configurações
const BUDBOT_API_URL = process.env.BUDBOT_API_URL || 'http://localhost:5000';
const API_SECRET = process.env.API_SECRET || 'budbot-secret-key';
const SESSION_PATH = process.env.WWEB_SESSION_PATH || '/data/wweb-session';

console.log('🚀 BudBot WhatsApp Connector v4.3 - Render Stable');
console.log('- BUDBOT_API_URL:', BUDBOT_API_URL);
console.log('- PORT:', PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- SESSION_PATH:', SESSION_PATH);

// Estado do cliente WhatsApp
let client = null;
let isReady = false;
let qrCodeData = null;
let qrCodeImage = null;
let initializationAttempts = 0;
let isInitializing = false;
let consecutiveErrors = 0;
let isAuthenticated = false;

// Função para aguardar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Monitor simples de memória
function logMemoryUsage() {
  const used = process.memoryUsage();
  console.log(`📊 Memória: RSS=${Math.round(used.rss / 1024 / 1024)}MB, Heap=${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

// Garantir que diretório de sessão existe
function ensureSessionDirectoryExists() {
  try {
    if (!fs.existsSync(SESSION_PATH)) {
      fs.mkdirSync(SESSION_PATH, { recursive: true, mode: 0o777 });
      console.log(`📁 Diretório criado: ${SESSION_PATH}`);
    } else {
      const sessionFiles = fs.readdirSync(SESSION_PATH);
      console.log(`✅ Sessão: ${sessionFiles.length} arquivos`);
    }
    return SESSION_PATH;
  } catch (error) {
    console.error(`❌ Erro sessão:`, error.message);
    const fallbackPath = path.join(__dirname, '.wwebjs_auth');
    if (!fs.existsSync(fallbackPath)) {
      fs.mkdirSync(fallbackPath, { recursive: true });
    }
    return fallbackPath;
  }
}

// Detectar Chromium
function findChromiumPath() {
  const paths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log(`✅ Chromium: ${p}`);
      return p;
    }
  }
  return undefined;
}

// Configuração MINIMALISTA do Puppeteer
function getPuppeteerConfig() {
  const chromiumPath = findChromiumPath();
  
  // CONFIGURAÇÃO SUPER MINIMALISTA - apenas o essencial
  const config = {
    headless: true,
    timeout: 0, // Sem timeout
    args: [
      // APENAS FLAGS CRÍTICAS
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process', // Processo único
      '--no-zygote',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--aggressive-cache-discard',
      '--disable-features=VizDisplayCompositor'
    ]
  };

  if (chromiumPath) {
    config.executablePath = chromiumPath;
  }

  console.log(`📋 Puppeteer MINIMALISTA com ${config.args.length} flags`);
  return config;
}

// Cleanup simples e rápido
async function simpleCleanup() {
  if (!client) return;
  
  try {
    console.log('🧹 Cleanup simples...');
    
    if (client.pupPage && !client.pupPage.isClosed()) {
      await client.pupPage.close();
    }
    
    if (client.pupBrowser) {
      await client.pupBrowser.close();
    }
    
    if (!isAuthenticated && typeof client.destroy === 'function') {
      await client.destroy();
    }
    
  } catch (error) {
    console.log('⚠️ Warning cleanup:', error.message);
  } finally {
    client = null;
    console.log('✅ Cleanup concluído');
  }
}

// Inicializar com estratégia SIMPLES
async function initializeWhatsApp() {
  if (isInitializing) {
    console.log('⚠️ Já inicializando...');
    return;
  }

  isInitializing = true;
  initializationAttempts++;
  consecutiveErrors++;
  
  logMemoryUsage();
  
  // Aguardar tempo progressivo mas limitado
  const waitTime = Math.min(600000, 30000 + (consecutiveErrors * 30000)); // Max 10 min
  
  console.log(`🔄 Tentativa ${initializationAttempts} (erros: ${consecutiveErrors})`);
  console.log(`⏳ Aguardando ${waitTime/1000}s...`);
  
  await sleep(waitTime);
  
  try {
    const sessionPath = ensureSessionDirectoryExists();
    
    // Cleanup rápido
    await simpleCleanup();
    await sleep(5000);
    
    console.log('📱 Criando cliente SIMPLES...');
    
    // Cliente com configuração MINIMALISTA
    client = new Client({
      authStrategy: new LocalAuth({
        name: 'budbot-simple',
        dataPath: sessionPath
      }),
      puppeteer: getPuppeteerConfig(), // Configuração minimalista
      webVersionCache: { type: 'none' },
      takeoverOnConflict: false, // Não forçar takeover
      takeoverTimeoutMs: 0, // Sem timeout takeover
      restartOnAuthFail: false,
      qrMaxRetries: 20 // Mais tentativas
    });

    setupWhatsAppEvents();
    
    console.log('🔧 Inicializando SIMPLES...');
    
    // Usar Promise.race com timeout LONGO para evitar Target closed
    const initPromise = client.initialize();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout após 10 minutos')), 600000) // 10 min
    );
    
    await Promise.race([initPromise, timeoutPromise]);
    
    console.log('✅ Cliente inicializado!');
    consecutiveErrors = 0;
    
  } catch (error) {
    console.error(`❌ Erro tentativa ${initializationAttempts}:`, error.message);
    
    await simpleCleanup();
    
    // Retry com delay maior para Protocol/Target errors
    let retryDelay;
    if (error.message.includes('Protocol') || error.message.includes('Target closed')) {
      retryDelay = Math.min(1800000, 600000 + (consecutiveErrors * 300000)); // Max 30 min
      console.log(`🔄 Protocol/Target error - aguardando ${retryDelay/1000}s`);
    } else if (error.message.includes('Timeout')) {
      retryDelay = Math.min(900000, 300000 + (consecutiveErrors * 180000)); // Max 15 min
      console.log(`🔄 Timeout - aguardando ${retryDelay/1000}s`);
    } else {
      retryDelay = Math.min(600000, 120000 + (consecutiveErrors * 90000)); // Max 10 min
      console.log(`🔄 General error - aguardando ${retryDelay/1000}s`);
    }
    
    setTimeout(() => {
      isInitializing = false;
      initializeWhatsApp();
    }, retryDelay);
    
    return;
  }
  
  isInitializing = false;
}

// Events básicos
function setupWhatsAppEvents() {
  if (!client) return;

  client.on('qr', async (qr) => {
    console.log('📱 QR Code gerado!');
    qrcodeTerminal.generate(qr, { small: true });
    
    try {
      qrCodeImage = await qrcode.toDataURL(qr, { width: 350 });
      qrCodeData = qr;
      console.log('✅ QR visual pronto');
    } catch (error) {
      qrCodeData = qr;
      qrCodeImage = null;
    }
    
    consecutiveErrors = 0;
  });

  client.on('authenticated', () => {
    console.log('🔐 Autenticado!');
    isAuthenticated = true;
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp PRONTO!');
    logMemoryUsage();
    isReady = true;
    isAuthenticated = true;
    qrCodeData = null;
    qrCodeImage = null;
    initializationAttempts = 0;
    consecutiveErrors = 0;
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading: ${percent}% - ${message}`);
  });

  client.on('message', async (message) => {
    try {
      if (message.from.includes('@g.us')) return;

      const contact = await message.getContact();
      const messageData = {
        phone: message.from.replace('@c.us', ''),
        message: message.body,
        contact_name: contact.pushname || contact.name || null,
        whatsapp_message_id: message.id.id,
        timestamp: new Date().toISOString()
      };

      console.log(`📨 ${messageData.phone}: ${messageData.message}`);

      const response = await axios.post(`${BUDBOT_API_URL}/api/whatsapp-connector/receive`, messageData, {
        headers: {
          'Authorization': `Bearer ${API_SECRET}`,
          'X-WhatsApp-Connector': 'budbot-connector-v4.3',
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      if (response.data.auto_reply && response.data.reply_message) {
        await message.reply(response.data.reply_message);
        console.log(`🤖 Resposta enviada`);
      }

    } catch (error) {
      console.error('❌ Erro processando mensagem:', error.message);
    }
  });

  client.on('disconnected', (reason) => {
    console.log('⚠️ Desconectado:', reason);
    isReady = false;
    setTimeout(() => initializeWhatsApp(), 90000);
  });

  client.on('auth_failure', async (msg) => {
    console.error('❌ Falha autenticação:', msg);
    isReady = false;
    isAuthenticated = false;
    qrCodeData = null;
    qrCodeImage = null;
    
    try {
      const sessionFiles = fs.readdirSync(ensureSessionDirectoryExists());
      for (const file of sessionFiles) {
        fs.unlinkSync(path.join(ensureSessionDirectoryExists(), file));
      }
      console.log('🗑️ Sessão limpa');
    } catch (error) {
      console.log('⚠️ Warning limpeza:', error.message);
    }
    
    await simpleCleanup();
    setTimeout(initializeWhatsApp, 120000);
  });
}

// API Routes básicas
app.get('/health', (req, res) => {
  const used = process.memoryUsage();
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '4.3.0-render-stable',
    status: 'online',
    whatsapp_ready: isReady,
    is_authenticated: isAuthenticated,
    attempts: initializationAttempts,
    errors: consecutiveErrors,
    memory_mb: Math.round(used.rss / 1024 / 1024),
    approach: 'minimal-stable'
  });
});

app.get('/qr', (req, res) => {
  if (qrCodeImage) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp QR - BudBot v4.3</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="45">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: system-ui, sans-serif; 
                background: linear-gradient(135deg, #25D366, #128C7E);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .container { 
                background: white; 
                padding: 40px; 
                border-radius: 15px; 
                text-align: center;
                max-width: 500px;
                width: 100%;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            .title { 
                color: #333; 
                margin-bottom: 15px; 
                font-size: 2em;
                font-weight: bold;
            }
            .version {
                background: #007bff;
                color: white;
                padding: 8px 16px;
                border-radius: 12px;
                font-size: 0.9em;
                margin: 15px 0;
                display: inline-block;
            }
            .qr-container { 
                padding: 20px;
                background: #f8f9fa;
                border-radius: 12px;
                margin: 20px 0;
            }
            .qr-container img { 
                max-width: 100%;
                width: 300px;
                height: 300px;
                background: white;
                padding: 10px;
                border-radius: 8px;
            }
            .footer {
                color: #666;
                font-size: 0.8em;
                margin-top: 15px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 class="title">WhatsApp QR</h1>
            <div class="version">v4.3 Render Stable</div>
            
            <div class="qr-container">
                <img src="${qrCodeImage}" alt="QR Code" />
            </div>
            
            <div class="footer">
                <strong>BudBot v4.3</strong><br>
                Abordagem minimalista estável<br>
                <small>Refresh em 45s</small>
            </div>
        </div>
    </body>
    </html>`;
    res.send(html);
    
  } else if (isReady) {
    res.send(`
    <div style="text-align: center; padding: 50px; background: #25D366; color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div>
            <h1 style="font-size: 3em; margin-bottom: 20px;">✅</h1>
            <h2>Conectado!</h2>
            <p style="margin-top: 20px;">BudBot v4.3 Stable</p>
        </div>
    </div>`);
    
  } else {
    res.send(`
    <div style="text-align: center; padding: 50px; background: #6c757d; color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div>
            <h1 style="font-size: 3em; margin-bottom: 20px;">⏳</h1>
            <h2>Iniciando v4.3...</h2>
            <p style="margin: 20px 0;">Tentativa: ${initializationAttempts}</p>
            <p>Abordagem estável</p>
        </div>
        <script>setTimeout(() => location.reload(), 30000);</script>
    </div>`);
  }
});

app.post('/send', async (req, res) => {
  try {
    if (!isReady) {
      return res.status(503).json({ success: false, error: 'WhatsApp não conectado' });
    }

    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios' });
    }

    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);

    console.log(`📤 Enviado: ${phone}`);
    res.json({ success: true, message: 'Enviado' });

  } catch (error) {
    console.error('❌ Erro envio:', error.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

app.get('/', (req, res) => {
  const used = process.memoryUsage();
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '4.3.0-render-stable',
    status: isReady ? 'connected' : 'initializing',
    approach: 'minimal-stable',
    memory_mb: Math.round(used.rss / 1024 / 1024),
    attempts: initializationAttempts,
    errors: consecutiveErrors
  });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor ativo na porta ${PORT}`);
  console.log(`🎯 Abordagem MINIMALISTA para estabilidade`);
  console.log(`📏 Limite: 384MB (mais margem)`);
  console.log(`🎨 QR visual em /qr`);
  
  logMemoryUsage();
  
  setTimeout(() => {
    console.log('🚀 Iniciando com abordagem ESTÁVEL...');
    initializeWhatsApp();
  }, 25000); // Aguardar mais tempo antes de iniciar
});

// Handlers de sinal
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT - encerrando...');
  await simpleCleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM - encerrando...');
  await simpleCleanup();
  process.exit(0);
});

process.on('unhandledRejection', async (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  if (reason.message && reason.message.includes('Target closed')) {
    await simpleCleanup();
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  if (error.message.includes('Target closed')) {
    setTimeout(simpleCleanup, 5000);
  }
});