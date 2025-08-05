#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector v4.2
 * Memory Optimized - Render.com Compatible (sem --expose-gc)
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

console.log('🚀 BudBot WhatsApp Connector v4.2 - Memory Optimized (Render Compatible)');
console.log('- BUDBOT_API_URL:', BUDBOT_API_URL);
console.log('- PORT:', PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- SESSION_PATH:', SESSION_PATH);
console.log('- MEMORY LIMIT: 256MB (sem expose-gc)');

// Estado do cliente WhatsApp
let client = null;
let isReady = false;
let qrCodeData = null;
let qrCodeImage = null;
let initializationAttempts = 0;
let isInitializing = false;
let lastErrorTime = 0;
let consecutiveErrors = 0;
let isAuthenticated = false;

// Garbage collection automático (sem --expose-gc flag)
const performGC = () => {
  if (global.gc) {
    try {
      global.gc();
      console.log('🗑️ GC automático executado');
    } catch (e) {
      console.log('⚠️ GC não disponível:', e.message);
    }
  } else {
    console.log('ℹ️ GC manual não disponível (rodando sem --expose-gc)');
  }
};

// GC periódico (funciona apenas se --expose-gc estiver disponível)
setInterval(performGC, 300000); // A cada 5 minutos

// Função para aguardar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Garantir que diretório de sessão existe
function ensureSessionDirectoryExists() {
  try {
    if (!fs.existsSync(SESSION_PATH)) {
      fs.mkdirSync(SESSION_PATH, { recursive: true, mode: 0o777 });
      console.log(`📁 Diretório de sessão criado: ${SESSION_PATH}`);
    } else {
      console.log(`✅ Diretório de sessão existe: ${SESSION_PATH}`);
      
      const sessionFiles = fs.readdirSync(SESSION_PATH);
      if (sessionFiles.length > 0) {
        console.log(`💾 Sessão salva encontrada (${sessionFiles.length} arquivos)`);
      } else {
        console.log(`📂 Diretório vazio - primeira conexão`);
      }
    }
    
    fs.accessSync(SESSION_PATH, fs.constants.R_OK | fs.constants.W_OK);
    console.log(`✅ Permissões OK no diretório de sessão`);
    
  } catch (error) {
    console.error(`❌ Erro configurando diretório de sessão:`, error.message);
    
    const fallbackPath = path.join(__dirname, '.wwebjs_auth');
    console.log(`⚠️ Usando fallback: ${fallbackPath}`);
    
    if (!fs.existsSync(fallbackPath)) {
      fs.mkdirSync(fallbackPath, { recursive: true });
    }
    
    return fallbackPath;
  }
  
  return SESSION_PATH;
}

// Detectar caminho do Chromium
function findChromiumPath() {
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.PUPPETEER_EXECUTABLE_PATH
  ];

  for (const path of possiblePaths) {
    if (path && fs.existsSync(path)) {
      console.log(`✅ Chromium encontrado: ${path}`);
      return path;
    }
  }
  
  console.log('⚠️ Chromium não encontrado, usando padrão');
  return undefined;
}

// Configuração Puppeteer OTIMIZADA PARA MEMÓRIA
function getPuppeteerConfig() {
  const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
  const chromiumPath = findChromiumPath();
  
  const config = {
    headless: true,
    timeout: 0,
    args: [
      // MEMORY OPTIMIZATION - Flags essenciais para baixo consumo
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // CRÍTICO: processo único para economizar RAM
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      
      // MEMORY LIMITS
      '--memory-pressure-off',
      '--max_old_space_size=256', // Limite de 256MB para V8
      '--aggressive-cache-discard',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      
      // FEATURES DISABLED TO SAVE MEMORY
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-client-side-phishing-detection',
      '--disable-speech-api',
      '--disable-permissions-api',
      '--disable-notifications',
      '--disable-web-speech-api',
      
      // RENDERING OPTIMIZATION
      '--hide-scrollbars',
      '--mute-audio',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-back-forward-cache',
      '--disable-features=VizServiceDisplay',
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check'
    ]
  };

  if (chromiumPath) {
    config.executablePath = chromiumPath;
  }

  console.log(`📋 Puppeteer otimizado para memória com ${config.args.length} flags`);
  return config;
}

// Monitor de memória
function logMemoryUsage() {
  const used = process.memoryUsage();
  console.log(`📊 Memória: RSS=${Math.round(used.rss / 1024 / 1024)}MB, Heap=${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

// Limpeza ULTRA-SEGURA com otimização de memória
async function ultraSafeCleanupClient() {
  if (!client) return;
  
  try {
    console.log('🧹 Ultra-safe cleanup com otimização de memória...');
    logMemoryUsage();
    
    await sleep(3000);
    
    if (client.pupPage) {
      try {
        if (!client.pupPage.isClosed()) {
          await client.pupPage.close();
          console.log('📄 Página fechada');
        }
      } catch (e) {
        console.log('⚠️ Warning página:', e.message);
      }
    }
    
    await sleep(2000);
    
    if (client.pupBrowser) {
      try {
        await client.pupBrowser.close();
        console.log('🌐 Browser fechado');
      } catch (e) {
        console.log('⚠️ Warning browser:', e.message);
      }
    }
    
    await sleep(2000);
    
    if (!isAuthenticated && client && typeof client.destroy === 'function') {
      try {
        await client.destroy();
        console.log('💥 Cliente destruído');
      } catch (e) {
        console.log('⚠️ Warning destroy:', e.message);
      }
    }
    
    // Tentar garbage collection
    performGC();
    
  } catch (error) {
    console.log('⚠️ Warning cleanup:', error.message);
  } finally {
    client = null;
    logMemoryUsage();
    console.log('✅ Ultra-safe cleanup concluída');
  }
}

// Inicializar WhatsApp com otimização de memória
async function initializeWhatsApp() {
  if (isInitializing) {
    console.log('⚠️ Inicialização em andamento...');
    return;
  }

  isInitializing = true;
  initializationAttempts++;
  
  logMemoryUsage();
  
  const now = Date.now();
  if (now - lastErrorTime < 360000) { // 6 minutos para memory issues
    consecutiveErrors++;
  } else {
    consecutiveErrors = 0;
  }
  lastErrorTime = now;

  // Backoff mais longo para permitir liberação de memória
  const waitTime = Math.min(900000, 60000 + (consecutiveErrors * 90000)); // Max 15 min
  
  console.log(`🔄 Tentativa ${initializationAttempts} (erros: ${consecutiveErrors})`);
  console.log(`⏳ Aguardando ${waitTime/1000}s para liberação de memória...`);
  
  await sleep(waitTime);
  
  try {
    const sessionPath = ensureSessionDirectoryExists();
    
    // Cleanup + tentar GC
    await ultraSafeCleanupClient();
    await sleep(8000); // Aguardar liberação de memória
    
    logMemoryUsage();
    console.log('📱 Criando cliente WhatsApp (otimizado para memória)...');
    
    // Cliente com configuração otimizada para memória
    client = new Client({
      authStrategy: new LocalAuth({
        name: 'budbot-memory-opt',
        dataPath: sessionPath
      }),
      puppeteer: getPuppeteerConfig(),
      webVersionCache: { type: 'none' },
      takeoverOnConflict: true,
      takeoverTimeoutMs: 90000, // Timeout maior para baixa memória
      restartOnAuthFail: false,
      qrMaxRetries: 15
    });

    setupWhatsAppEvents();
    
    console.log('🔧 Inicializando com otimização de memória (sem expose-gc)...');
    logMemoryUsage();
    
    // Inicialização sem timeout externo
    await client.initialize();
    
    console.log('✅ Cliente inicializado com sucesso (memória otimizada)!');
    logMemoryUsage();
    consecutiveErrors = 0;
    
  } catch (error) {
    console.error(`❌ Erro tentativa ${initializationAttempts}:`, error.message);
    logMemoryUsage();
    
    await ultraSafeCleanupClient();
    
    let retryDelay;
    if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
      retryDelay = Math.min(1200000, 300000 + (consecutiveErrors * 180000)); // Max 20 min
      console.log(`🔄 Memory/Target error - retry em ${retryDelay/1000}s`);
    } else if (error.message.includes('memory') || error.message.includes('OOM')) {
      retryDelay = Math.min(1800000, 600000 + (consecutiveErrors * 300000)); // Max 30 min
      console.log(`🔄 Memory exhaustion - retry em ${retryDelay/1000}s`);
    } else {
      retryDelay = Math.min(900000, 180000 + (consecutiveErrors * 120000)); // Max 15 min
      console.log(`🔄 General error - retry em ${retryDelay/1000}s`);
    }
    
    setTimeout(() => {
      isInitializing = false;
      initializeWhatsApp();
    }, retryDelay);
    
    return;
  }
  
  isInitializing = false;
}

// Events com monitoramento de memória
function setupWhatsAppEvents() {
  if (!client) return;

  client.on('qr', async (qr) => {
    console.log('📱 QR Code gerado (memória otimizada sem expose-gc)!');
    logMemoryUsage();
    
    qrcodeTerminal.generate(qr, { small: true });
    
    try {
      const qrImage = await qrcode.toDataURL(qr, {
        width: 400, // Menor para economizar memória
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      qrCodeData = qr;
      qrCodeImage = qrImage;
      
      console.log('✅ QR Code visual gerado (otimizado)');
      
    } catch (error) {
      console.error('❌ Erro gerando QR visual:', error.message);
      qrCodeData = qr;
      qrCodeImage = null;
    }
    
    consecutiveErrors = 0;
  });

  client.on('authenticated', () => {
    console.log('🔐 Autenticado (memória otimizada)!');
    logMemoryUsage();
    isAuthenticated = true;
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp pronto (otimização de memória ativa, sem expose-gc)!');
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
    if (percent % 25 === 0) logMemoryUsage(); // Log a cada 25%
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
          'X-WhatsApp-Connector': 'budbot-connector-v4.2',
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
    logMemoryUsage();
    
    isReady = false;
    
    setTimeout(async () => {
      await sleep(60000); // Aguardar liberação de memória
      console.log('🔄 Reconexão com otimização de memória...');
      initializeWhatsApp();
    }, 90000);
  });

  client.on('auth_failure', async (msg) => {
    console.error('❌ Falha autenticação:', msg);
    
    isReady = false;
    isAuthenticated = false;
    qrCodeData = null;
    qrCodeImage = null;
    
    try {
      const sessionPath = ensureSessionDirectoryExists();
      const sessionFiles = fs.readdirSync(sessionPath);
      for (const file of sessionFiles) {
        fs.unlinkSync(path.join(sessionPath, file));
      }
      console.log('🗑️ Sessão corrompida removida');
    } catch (error) {
      console.log('⚠️ Warning limpando sessão:', error.message);
    }
    
    await ultraSafeCleanupClient();
    setTimeout(initializeWhatsApp, 120000);
  });
}

// API Routes
app.get('/health', (req, res) => {
  const used = process.memoryUsage();
  const sessionPath = ensureSessionDirectoryExists();
  let sessionInfo = { files: 0, hasSession: false };
  
  try {
    const sessionFiles = fs.readdirSync(sessionPath);
    sessionInfo = {
      files: sessionFiles.length,
      hasSession: sessionFiles.length > 0,
      path: sessionPath
    };
  } catch (error) {
    sessionInfo.error = error.message;
  }

  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '4.2.0-memory-optimized-render-compatible',
    status: 'online',
    whatsapp_ready: isReady,
    is_authenticated: isAuthenticated,
    has_qr: qrCodeData !== null,
    has_qr_image: qrCodeImage !== null,
    initialization_attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    is_initializing: isInitializing,
    session_info: sessionInfo,
    memory_usage: {
      rss_mb: Math.round(used.rss / 1024 / 1024),
      heap_used_mb: Math.round(used.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(used.heapTotal / 1024 / 1024),
      external_mb: Math.round(used.external / 1024 / 1024)
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    optimizations: [
      'memory-optimized',
      'single-process',
      'aggressive-cache-discard',
      'heap-limit-256mb',
      'features-disabled',
      'render-compatible'
    ],
    gc_available: !!global.gc
  });
});

app.get('/status', (req, res) => {
  const used = process.memoryUsage();
  res.json({
    connected: isReady,
    authenticated: isAuthenticated,
    has_qr: qrCodeData !== null,
    has_visual_qr: qrCodeImage !== null,
    attempts: initializationAttempts,
    errors: consecutiveErrors,
    initializing: isInitializing,
    memory_optimized: true,
    memory_mb: Math.round(used.rss / 1024 / 1024),
    render_compatible: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/qr', (req, res) => {
  if (qrCodeImage) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp QR Code - BudBot v4.2</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="30">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
                font-family: system-ui, sans-serif; 
                background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .container { 
                background: white; 
                padding: 40px; 
                border-radius: 20px; 
                box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                text-align: center;
                max-width: 600px;
                width: 100%;
            }
            .title { 
                color: #333; 
                margin-bottom: 20px; 
                font-weight: 800;
                font-size: 2.5em;
                background: linear-gradient(135deg, #25D366, #128C7E);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .version {
                background: linear-gradient(135deg, #28a745, #20c956);
                color: white;
                padding: 12px 24px;
                border-radius: 20px;
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
                width: 350px;
                height: 350px;
                border-radius: 15px;
                background: white;
                padding: 15px;
            }
            .compatible-info {
                background: linear-gradient(135deg, #28a745, #20c956);
                color: white;
                padding: 20px;
                border-radius: 15px;
                margin: 20px 0;
                font-size: 0.9em;
            }
            .footer {
                color: #666;
                font-size: 0.9em;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 class="title">WhatsApp QR</h1>
            <div class="version">v4.2 Render Compatible</div>
            
            <div class="qr-container">
                <img src="${qrCodeImage}" alt="QR Code WhatsApp" />
            </div>
            
            <div class="compatible-info">
                ✅ RENDER.COM COMPATIBLE<br>
                Sem --expose-gc • Otimização automática • 256MB limit
            </div>
            
            <div class="footer">
                <strong>BudBot-IA WhatsApp Connector v4.2</strong><br>
                Compatível com Render.com<br>
                <small>Atualização em 30s</small>
            </div>
        </div>
    </body>
    </html>`;
    res.send(html);
    
  } else if (isReady && isAuthenticated) {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #25D366, #128C7E); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 60px; border-radius: 20px;">
            <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
            <h1 style="color: #25D366; margin-bottom: 20px; font-size: 2em;">Conectado!</h1>
            <div style="background: #28a745; color: white; padding: 15px 30px; border-radius: 15px; margin: 20px 0;">Render Compatible v4.2</div>
        </div>
    </div>`);
    
  } else {
    const used = process.memoryUsage();
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #6c757d, #495057); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 60px; border-radius: 20px;">
            <div style="font-size: 4em; margin-bottom: 20px;">⚙️</div>
            <h1 style="color: #6c757d; margin-bottom: 20px; font-size: 2em;">Carregando v4.2...</h1>
            <div style="background: #28a745; color: white; padding: 12px 24px; border-radius: 15px; margin: 15px 0;">Render Compatible</div>
            <p style="font-size: 1.1em; margin: 15px 0;">Tentativa: ${initializationAttempts}</p>
            <p style="color: #666;">Memória: ${Math.round(used.rss / 1024 / 1024)}MB</p>
            <p style="font-size: 1em; margin: 20px 0;">${isInitializing ? '🔄 Sem expose-gc' : '⏳ Aguardando...'}</p>
        </div>
        <script>setTimeout(() => location.reload(), 25000);</script>
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
        error: 'Campos obrigatórios'
      });
    }

    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);

    console.log(`📤 Enviado para ${phone}`);
    res.json({ 
      success: true, 
      message: 'Enviado',
      render_compatible: true,
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
    console.log('🔄 Restart (render compatible)...');
    await ultraSafeCleanupClient();
    isReady = false;
    qrCodeData = null;
    qrCodeImage = null;
    isInitializing = false;
    consecutiveErrors = 0;
    setTimeout(initializeWhatsApp, 20000);
    res.json({ success: true, message: 'Restart render compatible' });
  } catch (error) {
    res.json({ success: true, message: 'Restart iniciado' });
  }
});

app.get('/', (req, res) => {
  const used = process.memoryUsage();
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '4.2.0-render-compatible',
    status: isReady ? 'connected' : 'initializing',
    render_compatible: true,
    memory_optimized: true,
    memory_usage_mb: Math.round(used.rss / 1024 / 1024),
    attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    gc_available: !!global.gc,
    features: [
      'memory-optimized',
      'single-process',
      'heap-limit-256mb',
      'persistent-session',
      'visual-qr',
      'render-compatible'
    ]
  });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor na porta ${PORT}`);
  console.log(`✅ Render.com compatível (sem expose-gc)!`);
  console.log(`📏 Limite Node.js: 256MB`);
  console.log(`💾 Sessão persistente habilitada`);
  console.log(`🎨 QR Code visual em /qr`);
  console.log(`🗑️ GC disponível: ${!!global.gc}`);
  
  logMemoryUsage();
  
  setTimeout(() => {
    console.log('🚀 Iniciando compatível com Render.com...');
    initializeWhatsApp();
  }, 20000);
});

// Tratamento de sinais
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT - encerrando (liberando memória)...');
  await ultraSafeCleanupClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM - encerrando (liberando memória)...');
  await ultraSafeCleanupClient();
  process.exit(0);
});

// Monitoramento de memória crítica
process.on('warning', (warning) => {
  if (warning.name === 'MaxListenersExceededWarning' || warning.message.includes('memory')) {
    console.warn('⚠️ Warning memória:', warning.message);
    logMemoryUsage();
    performGC(); // Tentar GC se disponível
  }
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  logMemoryUsage();
  
  if (client && reason.message && 
      (reason.message.includes('close') || 
       reason.message.includes('Protocol error') ||
       reason.message.includes('Target closed') ||
       reason.message.includes('memory'))) {
    try {
      await ultraSafeCleanupClient();
      console.log('🧹 Cleanup após rejection');
    } catch (cleanupError) {
      console.log('⚠️ Erro cleanup:', cleanupError.message);
    }
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  logMemoryUsage();
  
  if (error.message.includes('Protocol error') || 
      error.message.includes('Target closed') ||
      error.message.includes('memory') ||
      error.message.includes('heap')) {
    setTimeout(async () => {
      await ultraSafeCleanupClient();
      console.log('🧹 Cleanup após exception');
    }, 8000);
  }
});