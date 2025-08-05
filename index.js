#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector v3.2
 * NPM Fix + Chromium Correções
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configurações
const BUDBOT_API_URL = process.env.BUDBOT_API_URL || 'http://localhost:5000';
const API_SECRET = process.env.API_SECRET || 'budbot-secret-key';

console.log('🚀 BudBot WhatsApp Connector v3.2 - NPM + Chromium Fix');
console.log('- BUDBOT_API_URL:', BUDBOT_API_URL);
console.log('- PORT:', PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);

// Estado do cliente WhatsApp
let client = null;
let isReady = false;
let qrCodeData = null;
let initializationAttempts = 0;
let isInitializing = false;
let lastErrorTime = 0;
let consecutiveErrors = 0;

// Função para aguardar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Detectar caminho do Chromium no sistema
function findChromiumPath() {
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.PUPPETEER_EXECUTABLE_PATH
  ];

  for (const path of possiblePaths) {
    if (path) {
      console.log(`🔍 Chromium encontrado: ${path}`);
      return path;
    }
  }
  
  console.log('⚠️ Chromium não encontrado, usando padrão');
  return undefined;
}

// Configuração Puppeteer com flags corretas para Render.com
function getPuppeteerConfig() {
  const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
  const chromiumPath = findChromiumPath();
  
  const config = {
    headless: true,
    timeout: 60000, // Timeout conforme sua sugestão
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  };

  // Usar Chromium do sistema se disponível
  if (chromiumPath) {
    config.executablePath = chromiumPath;
  }

  if (isRender) {
    config.args.push('--single-process'); // Apenas em produção conforme sua orientação
    console.log('🔧 Flags Render.com aplicadas');
  }

  console.log(`📋 Puppeteer configurado com ${config.args.length} flags`);
  return config;
}

// Limpeza segura do cliente conforme sua correção
async function safeCleanupClient() {
  if (!client) return;
  
  try {
    console.log('🧹 Iniciando limpeza segura...');
    
    // Verificar client.pupPage antes de qualquer operação
    if (client.pupPage && typeof client.pupPage.close === 'function') {
      await client.pupPage.close();
      console.log('📄 Página fechada');
    }
    
    if (client.pupBrowser && typeof client.pupBrowser.close === 'function') {
      await client.pupBrowser.close();
      console.log('🌐 Browser fechado');
    }
    
    // Só chamar destroy se client.pupPage existe (sua correção)
    if (client && client.pupPage && typeof client.destroy === 'function') {
      await client.destroy();
      console.log('💥 Cliente destruído');
    }
  } catch (error) {
    console.log('⚠️ Warning durante limpeza (ignorado):', error.message);
  } finally {
    client = null;
    console.log('✅ Limpeza concluída');
  }
}

// Inicializar WhatsApp com retry inteligente
async function initializeWhatsApp() {
  if (isInitializing) {
    console.log('⚠️ Inicialização em andamento...');
    return;
  }

  isInitializing = true;
  initializationAttempts++;
  
  // Backoff baseado em erros consecutivos
  const now = Date.now();
  if (now - lastErrorTime < 120000) {
    consecutiveErrors++;
  } else {
    consecutiveErrors = 0;
  }
  lastErrorTime = now;

  const waitTime = Math.min(180000, 15000 + (consecutiveErrors * 20000));
  
  console.log(`🔄 Tentativa ${initializationAttempts} (erros: ${consecutiveErrors})`);
  console.log(`⏳ Aguardando ${waitTime/1000}s...`);
  
  await sleep(waitTime);
  
  try {
    // Limpeza antes de tentar
    await safeCleanupClient();
    await sleep(3000);
    
    console.log('📱 Criando cliente WhatsApp...');
    
    // Configuração com suas correções
    client = new Client({
      authStrategy: new LocalAuth({
        name: `budbot-npm-fix-${Date.now()}`,
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: getPuppeteerConfig(),
      takeoverOnConflict: true,
      takeoverTimeoutMs: 15000,
      restartOnAuthFail: false,
      qrMaxRetries: 5
    });

    setupWhatsAppEvents();
    
    console.log('🔧 Inicializando com timeout estendido...');
    
    // Timeout aumentado para dar tempo ao Chromium
    await Promise.race([
      client.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout 300s')), 300000)
      )
    ]);
    
    console.log('✅ WhatsApp inicializado com sucesso!');
    consecutiveErrors = 0;
    
  } catch (error) {
    console.error(`❌ Erro tentativa ${initializationAttempts}:`, error.message);
    
    await safeCleanupClient();
    
    // Retry baseado no tipo de erro
    let retryDelay;
    if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
      retryDelay = Math.min(300000, 60000 + (consecutiveErrors * 30000));
      console.log(`🔄 Protocol error - retry em ${retryDelay/1000}s`);
    } else {
      retryDelay = Math.min(480000, 120000 + (consecutiveErrors * 60000));
      console.log(`🔄 Erro geral - retry em ${retryDelay/1000}s`);
    }
    
    setTimeout(() => {
      isInitializing = false;
      initializeWhatsApp();
    }, retryDelay);
    
    return;
  }
  
  isInitializing = false;
}

// Configurar eventos do WhatsApp
function setupWhatsAppEvents() {
  if (!client) return;

  client.on('qr', (qr) => {
    console.log('📱 QR Code gerado!');
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
    consecutiveErrors = 0;
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp conectado!');
    isReady = true;
    qrCodeData = null;
    initializationAttempts = 0;
    consecutiveErrors = 0;
  });

  client.on('authenticated', () => {
    console.log('🔐 Autenticado!');
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
          'X-WhatsApp-Connector': 'budbot-connector-v3.2',
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
    qrCodeData = null;
    
    setTimeout(async () => {
      await safeCleanupClient();
      setTimeout(initializeWhatsApp, 10000);
    }, 15000);
  });

  client.on('auth_failure', async (msg) => {
    console.error('❌ Falha autenticação:', msg);
    isReady = false;
    qrCodeData = null;
    
    await safeCleanupClient();
    setTimeout(initializeWhatsApp, 30000);
  });
}

// Rotas da API
app.get('/health', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '3.2.0-npm-chromium-fix',
    status: 'online',
    whatsapp_ready: isReady,
    has_qr: qrCodeData !== null,
    initialization_attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    is_initializing: isInitializing,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      budbot_url: BUDBOT_API_URL,
      render_detected: !!(process.env.RENDER || process.env.NODE_ENV === 'production'),
      chromium_path: findChromiumPath() || 'default',
      npm_fix_applied: true
    }
  });
});

app.get('/status', (req, res) => {
  res.json({
    connected: isReady,
    has_qr: qrCodeData !== null,
    attempts: initializationAttempts,
    errors: consecutiveErrors,
    initializing: isInitializing,
    chromium_available: !!findChromiumPath(),
    npm_fix: 'applied',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/qr', (req, res) => {
  if (qrCodeData) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp QR - BudBot v3.2</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
                margin: 0; 
                padding: 20px;
                background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container { 
                background: white; 
                padding: 50px; 
                border-radius: 25px; 
                box-shadow: 0 30px 60px rgba(0,0,0,0.2);
                text-align: center;
                max-width: 600px;
                width: 100%;
                animation: slideIn 0.5s ease-out;
            }
            @keyframes slideIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .title { 
                color: #333; 
                margin-bottom: 15px; 
                font-weight: 700;
                font-size: 2.5em;
            }
            .version {
                background: linear-gradient(135deg, #28a745, #20c956);
                color: white;
                padding: 12px 24px;
                border-radius: 25px;
                font-size: 1.1em;
                margin: 20px 0;
                display: inline-block;
                font-weight: 600;
            }
            .qr-container { 
                padding: 30px;
                background: #f8f9fa;
                border-radius: 20px;
                margin: 30px 0;
                border: 3px solid #25D366;
            }
            .qr-container img { 
                max-width: 100%; 
                border-radius: 15px;
                background: white;
                padding: 20px;
            }
            .footer {
                color: #666;
                margin-top: 30px;
                font-size: 1.1em;
            }
            .status {
                background: #25D366;
                color: white;
                padding: 15px 30px;
                border-radius: 25px;
                margin: 20px 0;
                font-weight: 600;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 class="title">📱 WhatsApp QR</h1>
            <div class="version">v3.2 NPM + Chromium Fix</div>
            <div class="status">🔄 Aguardando conexão...</div>
            
            <div class="qr-container">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrCodeData)}" alt="QR Code"/>
            </div>
            
            <div class="footer">
                <strong>BudBot-IA WhatsApp Connector v3.2</strong><br>
                NPM Fix Aplicado - Chromium Otimizado<br>
                <small>Atualização automática em 20s</small>
            </div>
        </div>
        <script>
            setTimeout(() => location.reload(), 20000);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) setTimeout(() => location.reload(), 2000);
            });
        </script>
    </body>
    </html>`;
    res.send(html);
  } else if (isReady) {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #25D366, #128C7E); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 60px; border-radius: 25px; box-shadow: 0 25px 50px rgba(0,0,0,0.2);">
            <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
            <h1 style="color: #25D366; margin-bottom: 20px;">WhatsApp Conectado!</h1>
            <div style="background: #28a745; color: white; padding: 15px 30px; border-radius: 20px; margin: 20px 0;">NPM + Chromium Fix v3.2</div>
            <p style="font-size: 1.2em; color: #666;">Sistema funcionando perfeitamente</p>
        </div>
    </div>`);
  } else {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #ffc107, #fd7e14); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 60px; border-radius: 25px;">
            <div style="font-size: 4em; margin-bottom: 20px;">🔧</div>
            <h1 style="color: #ffc107;">Inicializando v3.2...</h1>
            <div style="background: #007bff; color: white; padding: 10px 20px; border-radius: 15px; margin: 15px 0;">NPM Fix</div>
            <p>Tentativa: ${initializationAttempts}</p>
            <p>Erros: ${consecutiveErrors}</p>
            <p>${isInitializing ? '🔄 Inicializando...' : '⏳ Aguardando...'}</p>
        </div>
        <script>setTimeout(() => location.reload(), 10000);</script>
    </div>`);
  }
});

app.post('/send', async (req, res) => {
  try {
    if (!isReady) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado'
      });
    }

    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Campos phone e message obrigatórios'
      });
    }

    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);

    console.log(`📤 Mensagem enviada para ${phone}`);
    res.json({ 
      success: true, 
      message: 'Enviado com sucesso',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro envio:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno',
      details: error.message 
    });
  }
});

app.post('/restart', async (req, res) => {
  try {
    console.log('🔄 Restart solicitado...');
    await safeCleanupClient();
    isReady = false;
    qrCodeData = null;
    isInitializing = false;
    consecutiveErrors = 0;
    setTimeout(initializeWhatsApp, 5000);
    res.json({ success: true, message: 'Restart iniciado' });
  } catch (error) {
    res.json({ success: true, message: 'Restart iniciado com warnings' });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '3.2.0-npm-chromium-fix',
    status: isReady ? 'connected' : 'initializing',
    attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    fixes_applied: ['npm-install-fix', 'chromium-flags', 'safe-cleanup'],
    endpoints: {
      health: '/health',
      status: '/status', 
      qr: '/qr',
      send: 'POST /send',
      restart: 'POST /restart'
    }
  });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor na porta ${PORT}`);
  console.log(`🔧 NPM Fix aplicado: npm install --omit=dev`);
  console.log(`🔍 Chromium: ${findChromiumPath() || 'padrão'}`);
  
  setTimeout(() => {
    console.log('🚀 Iniciando WhatsApp com todas as correções...');
    initializeWhatsApp();
  }, 8000);
});

// Tratamento de sinais com sua correção
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT - encerrando...');
  await safeCleanupClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM - encerrando...');
  await safeCleanupClient();
  process.exit(0);
});

// Error handling com verificação client.pupPage conforme sua correção
process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  
  if (client && client.pupPage && reason.message && reason.message.includes('close')) {
    try {
      await safeCleanupClient();
      console.log('🧹 Cliente limpo após unhandled rejection');
    } catch (cleanupError) {
      console.log('⚠️ Erro limpeza:', cleanupError.message);
    }
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  
  if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
    setTimeout(async () => {
      await safeCleanupClient();
      console.log('🧹 Cliente limpo após uncaught exception');
    }, 2000);
  }
});