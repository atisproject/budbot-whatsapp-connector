#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector v4.0
 * Persistent Session + Visual QR + All Fixes
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

console.log('🚀 BudBot WhatsApp Connector v4.0 - Persistent Session');
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
      
      // Verificar se há sessão salva
      const sessionFiles = fs.readdirSync(SESSION_PATH);
      if (sessionFiles.length > 0) {
        console.log(`💾 Sessão salva encontrada (${sessionFiles.length} arquivos)`);
      } else {
        console.log(`📂 Diretório vazio - primeira conexão`);
      }
    }
    
    // Verificar permissões
    fs.accessSync(SESSION_PATH, fs.constants.R_OK | fs.constants.W_OK);
    console.log(`✅ Permissões OK no diretório de sessão`);
    
  } catch (error) {
    console.error(`❌ Erro configurando diretório de sessão:`, error.message);
    
    // Fallback para pasta local se /data não funcionar
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

// Configuração Puppeteer otimizada para persistência de sessão
function getPuppeteerConfig() {
  const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
  const chromiumPath = findChromiumPath();
  
  const config = {
    headless: true,
    timeout: 120000, // Timeout aumentado para persistência
    args: [
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
      // Importantes para persistência da sessão
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection'
    ]
  };

  if (chromiumPath) {
    config.executablePath = chromiumPath;
  }

  if (isRender) {
    config.args.push(
      '--single-process',
      '--memory-pressure-off',
      '--max_old_space_size=512'
    );
    console.log('🔧 Flags Render.com aplicadas para persistência');
  }

  console.log(`📋 Puppeteer configurado com ${config.args.length} flags`);
  return config;
}

// Limpeza segura sem perder sessão
async function safeCleanupClient() {
  if (!client) return;
  
  try {
    console.log('🧹 Limpeza segura iniciada (preservando sessão)...');
    
    if (client.pupPage && typeof client.pupPage.close === 'function') {
      try {
        await client.pupPage.close();
        console.log('📄 Página fechada');
      } catch (e) {
        console.log('⚠️ Warning página:', e.message);
      }
    }
    
    if (client.pupBrowser && typeof client.pupBrowser.close === 'function') {
      try {
        await client.pupBrowser.close();
        console.log('🌐 Browser fechado');
      } catch (e) {
        console.log('⚠️ Warning browser:', e.message);
      }
    }
    
    // NÃO destruir se autenticado para preservar sessão
    if (!isAuthenticated && client && client.pupPage && typeof client.destroy === 'function') {
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
    console.log('⚠️ Warning limpeza:', error.message);
  } finally {
    client = null;
    console.log('✅ Limpeza concluída');
  }
}

// Inicializar WhatsApp com persistência
async function initializeWhatsApp() {
  if (isInitializing) {
    console.log('⚠️ Inicialização em andamento...');
    return;
  }

  isInitializing = true;
  initializationAttempts++;
  
  const now = Date.now();
  if (now - lastErrorTime < 240000) { // 4 minutos para persistência
    consecutiveErrors++;
  } else {
    consecutiveErrors = 0;
  }
  lastErrorTime = now;

  // Backoff mais conservador para preservar sessão
  const waitTime = Math.min(360000, 30000 + (consecutiveErrors * 45000)); // Max 6 min
  
  console.log(`🔄 Tentativa ${initializationAttempts} (erros: ${consecutiveErrors})`);
  console.log(`⏳ Aguardando ${waitTime/1000}s...`);
  
  await sleep(waitTime);
  
  try {
    // Verificar/criar diretório de sessão
    const sessionPath = ensureSessionDirectoryExists();
    
    // Limpeza apenas se necessário
    await safeCleanupClient();
    await sleep(3000);
    
    console.log('📱 Criando cliente WhatsApp com persistência...');
    
    // Cliente com LocalAuth apontando para /data (persistente no Render)
    client = new Client({
      authStrategy: new LocalAuth({
        name: 'budbot-persistent',
        dataPath: sessionPath // Usar diretório persistente
      }),
      puppeteer: getPuppeteerConfig(),
      webVersionCache: { type: 'none' }, // Cache desabilitado por compatibilidade
      takeoverOnConflict: true,
      takeoverTimeoutMs: 30000, // Timeout maior para carregamento de sessão
      restartOnAuthFail: false,
      qrMaxRetries: 5
    });

    setupWhatsAppEvents();
    
    console.log('🔧 Inicializando com timeout estendido para persistência...');
    
    // Timeout generoso para carregamento de sessão existente
    await Promise.race([
      client.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout 600s')), 600000) // 10 min
      )
    ]);
    
    console.log('✅ Cliente inicializado com sucesso!');
    consecutiveErrors = 0;
    
  } catch (error) {
    console.error(`❌ Erro tentativa ${initializationAttempts}:`, error.message);
    
    // Limpeza cuidadosa
    await safeCleanupClient();
    
    let retryDelay;
    if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
      retryDelay = Math.min(600000, 120000 + (consecutiveErrors * 90000)); // Max 10 min
      console.log(`🔄 Protocol error - nova tentativa em ${retryDelay/1000}s`);
    } else if (error.message.includes('Session')) {
      retryDelay = Math.min(480000, 90000 + (consecutiveErrors * 60000)); // Max 8 min
      console.log(`🔄 Session error - nova tentativa em ${retryDelay/1000}s`);
    } else if (error.message.includes('Timeout')) {
      retryDelay = Math.min(720000, 240000 + (consecutiveErrors * 120000)); // Max 12 min
      console.log(`🔄 Timeout error - nova tentativa em ${retryDelay/1000}s`);
    } else {
      retryDelay = Math.min(540000, 150000 + (consecutiveErrors * 90000)); // Max 9 min
      console.log(`🔄 General error - nova tentativa em ${retryDelay/1000}s`);
    }
    
    setTimeout(() => {
      isInitializing = false;
      initializeWhatsApp();
    }, retryDelay);
    
    return;
  }
  
  isInitializing = false;
}

// Configurar eventos do WhatsApp com persistência
function setupWhatsAppEvents() {
  if (!client) return;

  // QR Code - Visual + Terminal
  client.on('qr', async (qr) => {
    console.log('📱 QR Code gerado! (primeira conexão)');
    
    // Terminal para logs
    qrcodeTerminal.generate(qr, { small: true });
    
    // Imagem para interface web
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
      console.log('🌐 Acesse /qr para escanear');
      console.log('💾 Após escanear, sessão será salva permanentemente');
      
    } catch (error) {
      console.error('❌ Erro gerando QR visual:', error.message);
      qrCodeData = qr;
      qrCodeImage = null;
    }
    
    consecutiveErrors = 0;
  });

  // Autenticado - SESSÃO PERSISTENTE
  client.on('authenticated', () => {
    console.log('🔐 Autenticação realizada!');
    console.log('💾 Sessão sendo salva no diretório persistente...');
    isAuthenticated = true;
  });

  // Cliente pronto
  client.on('ready', () => {
    console.log('✅ WhatsApp conectado e pronto!');
    console.log('💾 Sessão persistente ativa - não precisará escanear QR novamente');
    isReady = true;
    isAuthenticated = true;
    qrCodeData = null;
    qrCodeImage = null;
    initializationAttempts = 0;
    consecutiveErrors = 0;
  });

  // Loading
  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading: ${percent}% - ${message}`);
    if (percent > 50) {
      console.log('💾 Carregando sessão persistente...');
    }
  });

  // Mensagem recebida
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
          'X-WhatsApp-Connector': 'budbot-connector-v4.0',
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

  // Desconectado - PRESERVAR SESSÃO
  client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp desconectado:', reason);
    console.log('💾 Tentando reconectar com sessão persistente...');
    
    isReady = false;
    // NÃO resetar qrCodeData/qrCodeImage se autenticado
    
    setTimeout(async () => {
      // Aguardar antes de tentar reconectar
      await sleep(30000);
      
      console.log('🔄 Reconectando automaticamente...');
      initializeWhatsApp();
    }, 45000);
  });

  // Erro autenticação - LIMPAR SESSÃO CORROMPIDA
  client.on('auth_failure', async (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    console.log('🗑️ Limpando sessão corrompida...');
    
    isReady = false;
    isAuthenticated = false;
    qrCodeData = null;
    qrCodeImage = null;
    
    // Limpar sessão corrompida
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
    
    await safeCleanupClient();
    setTimeout(initializeWhatsApp, 60000);
  });
}

// Rotas da API
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
    version: '4.0.0-persistent-session',
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
    features: [
      'persistent-session',
      'visual-qr',
      'auto-reconnect',
      'session-preservation',
      'render-optimized'
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
    chromium_available: !!findChromiumPath(),
    persistent_session: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Endpoint QR Visual com informações de persistência
app.get('/qr', (req, res) => {
  const sessionPath = ensureSessionDirectoryExists();
  let hasStoredSession = false;
  
  try {
    const sessionFiles = fs.readdirSync(sessionPath);
    hasStoredSession = sessionFiles.length > 0;
  } catch (error) {
    // Ignorar erro
  }

  if (qrCodeImage) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp QR Code - BudBot v4.0</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="20">
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
            .logo { 
                font-size: 6em; 
                margin-bottom: 20px;
                animation: bounce 3s infinite;
            }
            @keyframes bounce {
                0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(-15px); }
                60% { transform: translateY(-8px); }
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
                position: relative;
                overflow: hidden;
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
            .persistence-info {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 30px;
                border-radius: 25px;
                margin: 40px 0;
                text-align: left;
            }
            .persistence-item {
                padding: 15px 0;
                border-bottom: 2px solid rgba(255,255,255,0.2);
                font-weight: 600;
                font-size: 1.2em;
                display: flex;
                align-items: center;
            }
            .persistence-item:last-child { border-bottom: none; }
            .persistence-icon {
                font-size: 1.5em;
                margin-right: 15px;
                width: 50px;
                text-align: center;
            }
            .steps {
                text-align: left;
                background: linear-gradient(135deg, #f1f3f4, #e8eaed);
                padding: 40px;
                border-radius: 25px;
                margin: 40px 0;
                border-left: 8px solid #25D366;
                box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            }
            .step {
                padding: 20px 0;
                border-bottom: 3px solid #dee2e6;
                font-weight: 700;
                font-size: 1.3em;
                color: #333;
                display: flex;
                align-items: center;
            }
            .step:last-child { border-bottom: none; }
            .step-icon {
                font-size: 1.5em;
                margin-right: 15px;
                width: 50px;
                text-align: center;
            }
            .status {
                background: linear-gradient(135deg, #28a745, #20c956);
                color: white;
                padding: 20px 40px;
                border-radius: 35px;
                display: inline-block;
                margin: 30px 0;
                font-weight: 800;
                font-size: 1.4em;
                box-shadow: 0 8px 25px rgba(40, 167, 69, 0.4);
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
            <div class="logo">📱</div>
            <h1 class="title">WhatsApp QR</h1>
            <div class="version">v4.0 Persistent Session</div>
            <div class="status">🔄 Escaneie uma única vez</div>
            
            <div class="qr-container">
                <img src="${qrCodeImage}" alt="QR Code WhatsApp" />
            </div>
            
            <div class="persistence-info">
                <div style="text-align: center; font-size: 1.5em; font-weight: 800; margin-bottom: 20px;">💾 SESSÃO PERSISTENTE</div>
                <div class="persistence-item">
                    <span class="persistence-icon">🔐</span>
                    Após escanear, login é salvo permanentemente
                </div>
                <div class="persistence-item">
                    <span class="persistence-icon">🔄</span>
                    Reconexão automática após restart do serviço
                </div>
                <div class="persistence-item">
                    <span class="persistence-icon">⚡</span>
                    Nunca mais precisará escanear QR Code
                </div>
                <div class="persistence-item">
                    <span class="persistence-icon">💾</span>
                    Sessão salva em: ${sessionPath}
                </div>
            </div>
            
            <div class="steps">
                <div class="step">
                    <span class="step-icon">📱</span>
                    Abra o WhatsApp no seu celular
                </div>
                <div class="step">
                    <span class="step-icon">⚙️</span>
                    Vá em Menu → Dispositivos conectados
                </div>
                <div class="step">
                    <span class="step-icon">🔗</span>
                    Toque em "Conectar um dispositivo"
                </div>
                <div class="step">
                    <span class="step-icon">📷</span>
                    Aponte a câmera para o código acima
                </div>
                <div class="step">
                    <span class="step-icon">💾</span>
                    Login será salvo automaticamente
                </div>
            </div>
            
            <div class="footer">
                <strong>🚀 BudBot-IA WhatsApp Connector v4.0</strong><br>
                Sessão Persistente + QR Visual + Reconnect Automático<br>
                <small>Atualização automática em 20 segundos</small>
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
            <h1 style="color: #25D366; margin-bottom: 25px; font-size: 3em;">WhatsApp Conectado!</h1>
            <div style="background: #dc3545; color: white; padding: 20px 40px; border-radius: 25px; margin: 30px 0; font-size: 1.3em;">Persistent Session v4.0</div>
            <p style="font-size: 1.4em; color: #666; margin: 25px 0;">Sessão persistente ativa</p>
            <div style="background: #007bff; color: white; padding: 15px 30px; border-radius: 20px; margin: 20px 0;">
                💾 Login salvo permanentemente
            </div>
            <div style="margin: 40px 0;">
                <a href="/health" style="background: linear-gradient(135deg, #25D366, #20c956); color: white; padding: 20px 40px; text-decoration: none; border-radius: 30px; font-weight: 700; font-size: 1.2em;">Ver Status Detalhado</a>
            </div>
        </div>
    </div>`);
    
  } else if (hasStoredSession) {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #ffc107, #fd7e14); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 80px; border-radius: 30px;">
            <div style="font-size: 5em; margin-bottom: 30px;">💾</div>
            <h1 style="color: #ffc107; margin-bottom: 25px; font-size: 2.5em;">Carregando Sessão...</h1>
            <div style="background: #dc3545; color: white; padding: 15px 30px; border-radius: 20px; margin: 20px 0; font-size: 1.2em;">Persistent Session v4.0</div>
            <p style="font-size: 1.3em; margin: 20px 0;">Sessão salva encontrada!</p>
            <p style="color: #666; font-size: 1.1em;">Conectando automaticamente...</p>
            <div style="margin: 40px 0;">
                <div style="width: 80px; height: 80px; border: 8px solid #f3f3f3; border-top: 8px solid #ffc107; border-radius: 50%; animation: spin 1.5s linear infinite; margin: 0 auto;"></div>
            </div>
            <p style="font-weight: 700; font-size: 1.2em; color: #007bff;">Não precisa escanear QR!</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <script>setTimeout(() => location.reload(), 15000);</script>
    </div>`);
    
  } else {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #6c757d, #495057); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 80px; border-radius: 30px;">
            <div style="font-size: 5em; margin-bottom: 30px;">🔧</div>
            <h1 style="color: #6c757d; margin-bottom: 25px; font-size: 2.5em;">Inicializando v4.0...</h1>
            <div style="background: #dc3545; color: white; padding: 15px 30px; border-radius: 20px; margin: 20px 0; font-size: 1.2em;">Persistent Session</div>
            <p style="font-size: 1.3em; margin: 20px 0;">Tentativa: ${initializationAttempts}</p>
            <p style="color: #666; font-size: 1.1em;">Erros: ${consecutiveErrors}</p>
            <p style="font-size: 1.2em; margin: 30px 0;">${isInitializing ? '🔄 Inicializando...' : '⏳ Aguardando...'}</p>
            <div style="margin: 40px 0;">
                <div style="width: 80px; height: 80px; border: 8px solid #f3f3f3; border-top: 8px solid #6c757d; border-radius: 50%; animation: spin 1.5s linear infinite; margin: 0 auto;"></div>
            </div>
            <p style="font-weight: 700; font-size: 1.2em; color: #dc3545;">Primeira vez: QR Code será exibido</p>
            <p style="font-size: 1em; color: #999; margin-top: 20px;">Sessão será salva após login</p>
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
        error: 'WhatsApp não conectado',
        authenticated: isAuthenticated
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
      persistent_session: isAuthenticated,
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
    console.log('🔄 Restart solicitado (preservando sessão)...');
    
    // Não limpar sessão se autenticado
    if (!isAuthenticated) {
      await safeCleanupClient();
    }
    
    isReady = false;
    qrCodeData = null;
    qrCodeImage = null;
    isInitializing = false;
    consecutiveErrors = 0;
    
    setTimeout(initializeWhatsApp, 10000);
    
    res.json({ 
      success: true, 
      message: 'Restart iniciado (sessão preservada)',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ 
      success: true, 
      message: 'Restart iniciado com warnings' 
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '4.0.0-persistent-session',
    status: isReady ? 'connected' : 'initializing',
    persistent_session: true,
    authenticated: isAuthenticated,
    qr_mode: 'visual',
    has_qr_image: qrCodeImage !== null,
    attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    features: [
      'persistent-session',
      'visual-qr',
      'auto-reconnect',
      'session-preservation',
      'render-optimized',
      'npm-fix',
      'protocol-fix'
    ],
    endpoints: {
      health: '/health',
      status: '/status', 
      qr_visual: '/qr',
      send: 'POST /send',
      restart: 'POST /restart'
    }
  });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor na porta ${PORT}`);
  console.log(`💾 Sessão persistente habilitada!`);
  console.log(`📁 Diretório: ${SESSION_PATH}`);
  console.log(`🎨 QR Code visual em /qr`);
  console.log(`🔧 Todas as correções aplicadas`);
  
  const chromiumPath = findChromiumPath();
  console.log(`🔍 Chromium: ${chromiumPath || 'padrão'}`);
  
  setTimeout(() => {
    console.log('🚀 Iniciando WhatsApp com Sessão Persistente...');
    initializeWhatsApp();
  }, 12000);
});

// Tratamento de sinais preservando sessão
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT - encerrando (preservando sessão)...');
  if (!isAuthenticated) {
    await safeCleanupClient();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM - encerrando (preservando sessão)...');
  if (!isAuthenticated) {
    await safeCleanupClient();
  }
  process.exit(0);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  
  if (client && client.pupPage && reason.message && 
      (reason.message.includes('close') || 
       reason.message.includes('Protocol error') ||
       reason.message.includes('LocalWebCache'))) {
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
  
  if (error.message.includes('Protocol error') || 
      error.message.includes('Target closed') ||
      error.message.includes('LocalWebCache')) {
    setTimeout(async () => {
      if (!isAuthenticated) {
        await safeCleanupClient();
        console.log('🧹 Cliente limpo após uncaught exception');
      }
    }, 5000);
  }
});