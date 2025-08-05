#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector v4.1
 * Target Closed Fix + Persistent Session
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

console.log('🚀 BudBot WhatsApp Connector v4.1 - Target Closed Fix');
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
let lastErrorTime = 0;
let consecutiveErrors = 0;
let isAuthenticated = false;

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

// Configuração Puppeteer ANTI-TARGET-CLOSED
function getPuppeteerConfig() {
  const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
  const chromiumPath = findChromiumPath();
  
  const config = {
    headless: true,
    timeout: 0, // TIMEOUT INFINITO - previne Target closed
    args: [
      // Flags básicas de segurança
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      
      // FLAGS ANTI-TARGET-CLOSED (essenciais)
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', 
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-background-networking',
      '--disable-client-side-phishing-detection',
      '--disable-sync',
      '--disable-default-apps',
      '--aggressive-cache-discard',
      '--memory-pressure-off',
      '--disable-back-forward-cache',
      
      // Flags específicas para manter aba ativa
      '--disable-features=VizDisplayCompositor,VizServiceDisplay',
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-component-update'
    ]
  };

  if (chromiumPath) {
    config.executablePath = chromiumPath;
  }

  if (isRender) {
    config.args.push(
      '--single-process',
      '--max_old_space_size=512'
    );
    console.log('🔧 Flags Render.com + Anti-Target-Closed aplicadas');
  }

  console.log(`📋 Puppeteer configurado com ${config.args.length} flags (timeout: infinito)`);
  return config;
}

// Limpeza ULTRA-SEGURA sem Target closed
async function ultraSafeCleanupClient() {
  if (!client) return;
  
  try {
    console.log('🧹 Ultra-safe cleanup iniciada...');
    
    // Aguardar antes de qualquer operação
    await sleep(2000);
    
    // Fechar página se existir e estiver ativa
    if (client.pupPage) {
      try {
        // Verificar se página ainda está ativa
        const isPageActive = !client.pupPage.isClosed();
        if (isPageActive) {
          await client.pupPage.close();
          console.log('📄 Página fechada');
        } else {
          console.log('📄 Página já estava fechada');
        }
      } catch (e) {
        console.log('⚠️ Warning página:', e.message);
      }
    }
    
    // Aguardar processamento
    await sleep(1000);
    
    // Fechar browser se existir
    if (client.pupBrowser) {
      try {
        const browserProcesses = client.pupBrowser.process();
        if (browserProcesses) {
          await client.pupBrowser.close();
          console.log('🌐 Browser fechado');
        }
      } catch (e) {
        console.log('⚠️ Warning browser:', e.message);
      }
    }
    
    // Aguardar finalização
    await sleep(1000);
    
    // Só destruir se NÃO estiver autenticado (preservar sessão)
    if (!isAuthenticated && client && typeof client.destroy === 'function') {
      try {
        await client.destroy();
        console.log('💥 Cliente destruído (não autenticado)');
      } catch (e) {
        console.log('⚠️ Warning destroy:', e.message);
      }
    } else if (isAuthenticated) {
      console.log('💾 Cliente preservado (sessão autenticada)');
    }
    
  } catch (error) {
    console.log('⚠️ Warning ultra-safe cleanup:', error.message);
  } finally {
    client = null;
    console.log('✅ Ultra-safe cleanup concluída');
  }
}

// Inicializar WhatsApp com proteção anti-Target-Closed
async function initializeWhatsApp() {
  if (isInitializing) {
    console.log('⚠️ Inicialização em andamento...');
    return;
  }

  isInitializing = true;
  initializationAttempts++;
  
  const now = Date.now();
  if (now - lastErrorTime < 300000) { // 5 minutos para Target closed
    consecutiveErrors++;
  } else {
    consecutiveErrors = 0;
  }
  lastErrorTime = now;

  // Backoff progressivo mais conservador para Target closed
  const waitTime = Math.min(600000, 45000 + (consecutiveErrors * 60000)); // Max 10 min
  
  console.log(`🔄 Tentativa ${initializationAttempts} (erros: ${consecutiveErrors})`);
  console.log(`⏳ Aguardando ${waitTime/1000}s...`);
  
  await sleep(waitTime);
  
  try {
    const sessionPath = ensureSessionDirectoryExists();
    
    // Ultra-safe cleanup
    await ultraSafeCleanupClient();
    await sleep(5000); // Aguardar cleanup completo
    
    console.log('📱 Criando cliente WhatsApp (anti-Target-Closed)...');
    
    // Cliente com configuração anti-Target-Closed
    client = new Client({
      authStrategy: new LocalAuth({
        name: 'budbot-target-fix',
        dataPath: sessionPath
      }),
      puppeteer: getPuppeteerConfig(), // Timeout infinito + flags
      webVersionCache: { type: 'none' },
      takeoverOnConflict: true,
      takeoverTimeoutMs: 60000, // Timeout maior
      restartOnAuthFail: false,
      qrMaxRetries: 10 // Mais tentativas
    });

    setupWhatsAppEvents();
    
    console.log('🔧 Inicializando com proteção anti-Target-Closed...');
    
    // SEM TIMEOUT - deixar Puppeteer gerenciar
    await client.initialize();
    
    console.log('✅ Cliente inicializado sem Target closed!');
    consecutiveErrors = 0;
    
  } catch (error) {
    console.error(`❌ Erro tentativa ${initializationAttempts}:`, error.message);
    
    await ultraSafeCleanupClient();
    
    let retryDelay;
    if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
      retryDelay = Math.min(900000, 180000 + (consecutiveErrors * 120000)); // Max 15 min
      console.log(`🔄 Target/Protocol error - retry em ${retryDelay/1000}s (timeout removido)`);
    } else if (error.message.includes('Timeout')) {
      retryDelay = Math.min(720000, 120000 + (consecutiveErrors * 90000)); // Max 12 min
      console.log(`🔄 Timeout error - retry em ${retryDelay/1000}s`);
    } else {
      retryDelay = Math.min(600000, 90000 + (consecutiveErrors * 60000)); // Max 10 min
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

// Events com proteção anti-Target-Closed
function setupWhatsAppEvents() {
  if (!client) return;

  client.on('qr', async (qr) => {
    console.log('📱 QR Code gerado (sem Target closed)!');
    
    qrcodeTerminal.generate(qr, { small: true });
    
    try {
      const qrImage = await qrcode.toDataURL(qr, {
        width: 450,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      qrCodeData = qr;
      qrCodeImage = qrImage;
      
      console.log('✅ QR Code visual gerado');
      console.log('🌐 Acesse /qr - proteção Target closed ativa');
      
    } catch (error) {
      console.error('❌ Erro gerando QR visual:', error.message);
      qrCodeData = qr;
      qrCodeImage = null;
    }
    
    consecutiveErrors = 0;
  });

  client.on('authenticated', () => {
    console.log('🔐 Autenticado sem Target closed!');
    console.log('💾 Sessão sendo salva (proteção ativa)...');
    isAuthenticated = true;
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp pronto (Target closed resolvido)!');
    console.log('💾 Sessão persistente + proteção Target closed ativa');
    isReady = true;
    isAuthenticated = true;
    qrCodeData = null;
    qrCodeImage = null;
    initializationAttempts = 0;
    consecutiveErrors = 0;
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading: ${percent}% - ${message} (timeout: infinito)`);
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
          'X-WhatsApp-Connector': 'budbot-connector-v4.1',
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
    console.log('🔄 Reconectando com proteção Target closed...');
    
    isReady = false;
    
    setTimeout(async () => {
      await sleep(45000);
      console.log('🔄 Reconexão automática...');
      initializeWhatsApp();
    }, 60000);
  });

  client.on('auth_failure', async (msg) => {
    console.error('❌ Falha autenticação:', msg);
    console.log('🗑️ Limpando sessão corrompida...');
    
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
    setTimeout(initializeWhatsApp, 90000);
  });
}

// API Routes
app.get('/health', (req, res) => {
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
    version: '4.1.0-target-closed-fix',
    status: 'online',
    whatsapp_ready: isReady,
    is_authenticated: isAuthenticated,
    has_qr: qrCodeData !== null,
    has_qr_image: qrCodeImage !== null,
    initialization_attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    is_initializing: isInitializing,
    session_info: sessionInfo,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      budbot_url: BUDBOT_API_URL,
      render_detected: !!(process.env.RENDER || process.env.NODE_ENV === 'production'),
      chromium_path: findChromiumPath() || 'default',
      session_path: sessionPath
    },
    fixes_applied: [
      'target-closed-fix',
      'timeout-infinite',
      'anti-backgrounding-flags',
      'persistent-session',
      'visual-qr',
      'ultra-safe-cleanup'
    ]
  });
});

app.get('/status', (req, res) => {
  res.json({
    connected: isReady,
    authenticated: isAuthenticated,
    has_qr: qrCodeData !== null,
    has_visual_qr: qrCodeImage !== null,
    attempts: initializationAttempts,
    errors: consecutiveErrors,
    initializing: isInitializing,
    target_closed_fix: true,
    timeout_infinite: true,
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
        <title>WhatsApp QR Code - BudBot v4.1</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="25">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
                background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .container { 
                background: white; 
                padding: 60px; 
                border-radius: 30px; 
                box-shadow: 0 40px 80px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 800px;
                width: 100%;
                animation: slideUp 0.6s ease-out;
            }
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(50px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .title { 
                color: #333; 
                margin-bottom: 20px; 
                font-weight: 800;
                font-size: 3em;
                background: linear-gradient(135deg, #25D366, #128C7E);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            .version {
                background: linear-gradient(135deg, #dc3545, #c82333);
                color: white;
                padding: 15px 30px;
                border-radius: 30px;
                font-size: 1.3em;
                margin: 25px 0;
                display: inline-block;
                font-weight: 700;
                box-shadow: 0 8px 25px rgba(220, 53, 69, 0.4);
            }
            .qr-container { 
                padding: 40px;
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                border-radius: 30px;
                margin: 40px 0;
                border: 5px solid #25D366;
                box-shadow: inset 0 4px 15px rgba(0,0,0,0.1);
            }
            .qr-container img { 
                max-width: 100%;
                width: 450px;
                height: 450px;
                border-radius: 25px;
                background: white;
                padding: 20px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            .fix-info {
                background: linear-gradient(135deg, #28a745, #20c956);
                color: white;
                padding: 30px;
                border-radius: 25px;
                margin: 40px 0;
                text-align: left;
            }
            .fix-item {
                padding: 15px 0;
                border-bottom: 2px solid rgba(255,255,255,0.2);
                font-weight: 600;
                font-size: 1.2em;
                display: flex;
                align-items: center;
            }
            .fix-item:last-child { border-bottom: none; }
            .fix-icon {
                font-size: 1.5em;
                margin-right: 15px;
                width: 50px;
                text-align: center;
            }
            .status {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 20px 40px;
                border-radius: 35px;
                display: inline-block;
                margin: 30px 0;
                font-weight: 800;
                font-size: 1.4em;
                box-shadow: 0 8px 25px rgba(0, 123, 255, 0.4);
                animation: pulse 2.5s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }
            .footer {
                color: #666;
                font-size: 1.1em;
                margin-top: 40px;
                line-height: 1.8;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 class="title">WhatsApp QR</h1>
            <div class="version">v4.1 Target Closed Fix</div>
            <div class="status">🚀 Proteção Target Closed Ativa</div>
            
            <div class="qr-container">
                <img src="${qrCodeImage}" alt="QR Code WhatsApp" />
            </div>
            
            <div class="fix-info">
                <div style="text-align: center; font-size: 1.5em; font-weight: 800; margin-bottom: 20px;">🛡️ CORREÇÕES APLICADAS</div>
                <div class="fix-item">
                    <span class="fix-icon">⏰</span>
                    Timeout infinito - sem fechamento prematuro
                </div>
                <div class="fix-item">
                    <span class="fix-icon">🛡️</span>
                    Flags anti-backgrounding aplicadas
                </div>
                <div class="fix-item">
                    <span class="fix-icon">💾</span>
                    Sessão persistente + proteção Target closed
                </div>
                <div class="fix-item">
                    <span class="fix-icon">🔄</span>
                    Ultra-safe cleanup sem perder conexão
                </div>
            </div>
            
            <div class="footer">
                <strong>🚀 BudBot-IA WhatsApp Connector v4.1</strong><br>
                Target Closed Fix + Sessão Persistente<br>
                <small>Atualização automática em 25 segundos</small>
            </div>
        </div>
    </body>
    </html>`;
    res.send(html);
    
  } else if (isReady && isAuthenticated) {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #25D366, #128C7E); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 80px; border-radius: 30px; box-shadow: 0 30px 60px rgba(0,0,0,0.3);">
            <div style="font-size: 6em; margin-bottom: 30px;">✅</div>
            <h1 style="color: #25D366; margin-bottom: 25px; font-size: 3em;">Conectado!</h1>
            <div style="background: #dc3545; color: white; padding: 20px 40px; border-radius: 25px; margin: 30px 0; font-size: 1.3em;">Target Closed Fix v4.1</div>
            <p style="font-size: 1.4em; color: #666; margin: 25px 0;">Sem Protocol errors</p>
            <div style="background: #28a745; color: white; padding: 15px 30px; border-radius: 20px; margin: 20px 0;">
                🛡️ Proteção Target closed ativa
            </div>
        </div>
    </div>`);
    
  } else {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #6c757d, #495057); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 80px; border-radius: 30px;">
            <div style="font-size: 5em; margin-bottom: 30px;">🛡️</div>
            <h1 style="color: #6c757d; margin-bottom: 25px; font-size: 2.5em;">Carregando v4.1...</h1>
            <div style="background: #dc3545; color: white; padding: 15px 30px; border-radius: 20px; margin: 20px 0; font-size: 1.2em;">Target Closed Fix</div>
            <p style="font-size: 1.3em; margin: 20px 0;">Tentativa: ${initializationAttempts}</p>
            <p style="color: #666; font-size: 1.1em;">Erros: ${consecutiveErrors}</p>
            <p style="font-size: 1.2em; margin: 30px 0;">${isInitializing ? '🔄 Timeout: ∞' : '⏳ Aguardando...'}</p>
            <div style="margin: 40px 0;">
                <div style="width: 80px; height: 80px; border: 8px solid #f3f3f3; border-top: 8px solid #dc3545; border-radius: 50%; animation: spin 1.5s linear infinite; margin: 0 auto;"></div>
            </div>
            <p style="font-weight: 700; font-size: 1.2em; color: #dc3545;">Proteção Target closed ativa</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <script>setTimeout(() => location.reload(), 20000);</script>
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
      target_closed_fix: true,
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
    console.log('🔄 Restart (Target closed fix)...');
    await ultraSafeCleanupClient();
    isReady = false;
    qrCodeData = null;
    qrCodeImage = null;
    isInitializing = false;
    consecutiveErrors = 0;
    setTimeout(initializeWhatsApp, 15000);
    res.json({ success: true, message: 'Restart com proteção' });
  } catch (error) {
    res.json({ success: true, message: 'Restart iniciado' });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '4.1.0-target-closed-fix',
    status: isReady ? 'connected' : 'initializing',
    target_closed_protection: true,
    timeout_infinite: true,
    attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    features: [
      'target-closed-fix',
      'timeout-infinite',
      'anti-backgrounding-flags',
      'persistent-session',
      'visual-qr',
      'ultra-safe-cleanup'
    ],
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
  console.log(`🛡️ Proteção Target Closed ativa!`);
  console.log(`⏰ Timeout infinito configurado`);
  console.log(`💾 Sessão persistente habilitada`);
  console.log(`🎨 QR Code visual em /qr`);
  
  const chromiumPath = findChromiumPath();
  console.log(`🔍 Chromium: ${chromiumPath || 'padrão'}`);
  
  setTimeout(() => {
    console.log('🚀 Iniciando com proteção Target Closed...');
    initializeWhatsApp();
  }, 15000);
});

// Tratamento de sinais
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT - encerrando com proteção...');
  await ultraSafeCleanupClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM - encerrando com proteção...');
  await ultraSafeCleanupClient();
  process.exit(0);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  
  if (client && client.pupPage && reason.message && 
      (reason.message.includes('close') || 
       reason.message.includes('Protocol error') ||
       reason.message.includes('Target closed'))) {
    try {
      await ultraSafeCleanupClient();
      console.log('🧹 Ultra-safe cleanup após rejection');
    } catch (cleanupError) {
      console.log('⚠️ Erro cleanup:', cleanupError.message);
    }
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  
  if (error.message.includes('Protocol error') || 
      error.message.includes('Target closed')) {
    setTimeout(async () => {
      await ultraSafeCleanupClient();
      console.log('🧹 Ultra-safe cleanup após exception');
    }, 5000);
  }
});