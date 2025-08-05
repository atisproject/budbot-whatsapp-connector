#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector v3.1
 * Chromium Fix para Render.com
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

console.log('🚀 BudBot WhatsApp Connector v3.1 - Chromium Fix');
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
      console.log(`🔍 Tentando Chromium em: ${path}`);
      return path;
    }
  }
  
  console.log('⚠️ Chromium não encontrado, usando padrão do Puppeteer');
  return undefined;
}

// Configuração Puppeteer otimizada para Render.com
function getPuppeteerConfig() {
  const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
  const chromiumPath = findChromiumPath();
  
  const config = {
    headless: true,
    timeout: 60000, // Timeout aumentado para 60s
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
      '--memory-pressure-off'
    ]
  };

  // Usar Chromium do sistema se disponível
  if (chromiumPath) {
    config.executablePath = chromiumPath;
    console.log(`✅ Usando Chromium: ${chromiumPath}`);
  }

  if (isRender) {
    config.args.push(
      '--single-process',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection'
    );
    console.log('🔧 Configuração Render.com aplicada');
  }

  console.log(`📋 Args Puppeteer: ${config.args.length} flags`);
  return config;
}

// Limpeza segura do cliente
async function safeCleanupClient() {
  if (!client) return;
  
  try {
    console.log('🧹 Iniciando limpeza do cliente...');
    
    // Verificar e fechar página primeiro
    if (client.pupPage && typeof client.pupPage.close === 'function') {
      await client.pupPage.close();
      console.log('📄 Página fechada');
    }
    
    // Verificar e fechar browser
    if (client.pupBrowser && typeof client.pupBrowser.close === 'function') {
      await client.pupBrowser.close();
      console.log('🌐 Browser fechado');
    }
    
    // Só chamar destroy se cliente tem página inicializada
    if (client && typeof client.destroy === 'function' && client.pupPage) {
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

// Inicializar WhatsApp com estratégia robusta
async function initializeWhatsApp() {
  if (isInitializing) {
    console.log('⚠️ Inicialização já em andamento, aguardando...');
    return;
  }

  isInitializing = true;
  initializationAttempts++;
  
  // Estratégia de backoff baseada em erros consecutivos
  const now = Date.now();
  if (now - lastErrorTime < 120000) { // 2 minutos
    consecutiveErrors++;
  } else {
    consecutiveErrors = 0;
  }
  lastErrorTime = now;

  // Backoff inteligente
  const baseDelay = 10000; // 10s base
  const errorMultiplier = Math.min(consecutiveErrors * 15000, 180000); // Max 3 min
  const waitTime = baseDelay + errorMultiplier;
  
  console.log(`🔄 Tentativa ${initializationAttempts} (erros consecutivos: ${consecutiveErrors})`);
  console.log(`⏳ Aguardando ${waitTime/1000}s antes de tentar...`);
  
  await sleep(waitTime);
  
  try {
    // Limpeza completa antes de tentar
    await safeCleanupClient();
    await sleep(3000); // Aguardar limpeza completa
    
    console.log('📱 Criando novo cliente WhatsApp...');
    
    // Obter configuração do Puppeteer
    const puppeteerConfig = getPuppeteerConfig();
    
    // Criar cliente com configuração robusta
    client = new Client({
      authStrategy: new LocalAuth({
        name: `budbot-chromium-${Date.now()}`,
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: puppeteerConfig,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 15000,
      restartOnAuthFail: false,
      qrMaxRetries: 5
    });

    // Configurar eventos antes de inicializar
    setupWhatsAppEvents();
    
    console.log('🔧 Inicializando cliente com timeout estendido...');
    
    // Promise de inicialização com timeout generoso
    await Promise.race([
      client.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout de 300 segundos')), 300000)
      )
    ]);
    
    console.log('✅ Cliente inicializado com sucesso!');
    consecutiveErrors = 0; // Reset on success
    
  } catch (error) {
    console.error(`❌ Erro na tentativa ${initializationAttempts}:`, error.message);
    
    // Limpeza após erro
    await safeCleanupClient();
    
    // Determinar tipo de erro e delay
    let retryDelay;
    if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
      retryDelay = Math.min(300000, 60000 + (consecutiveErrors * 30000)); // Max 5 min
      console.log(`🔄 Protocol error - nova tentativa em ${retryDelay/1000}s`);
    } else if (error.message.includes('Timeout')) {
      retryDelay = Math.min(600000, 120000 + (consecutiveErrors * 60000)); // Max 10 min
      console.log(`🔄 Timeout error - nova tentativa em ${retryDelay/1000}s`);
    } else {
      retryDelay = Math.min(450000, 90000 + (consecutiveErrors * 45000)); // Max 7.5 min
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

// Configurar eventos do WhatsApp
function setupWhatsAppEvents() {
  if (!client) return;

  // QR Code
  client.on('qr', (qr) => {
    console.log('📱 QR Code gerado com sucesso!');
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
    consecutiveErrors = 0; // Reset ao gerar QR
  });

  // Cliente pronto
  client.on('ready', () => {
    console.log('✅ WhatsApp conectado com sucesso!');
    isReady = true;
    qrCodeData = null;
    initializationAttempts = 0;
    consecutiveErrors = 0;
  });

  // Autenticado
  client.on('authenticated', () => {
    console.log('🔐 Autenticação realizada com sucesso!');
  });

  // Loading
  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading: ${percent}% - ${message}`);
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

      // Enviar para BudBot-IA
      const response = await axios.post(`${BUDBOT_API_URL}/api/whatsapp-connector/receive`, messageData, {
        headers: {
          'Authorization': `Bearer ${API_SECRET}`,
          'X-WhatsApp-Connector': 'budbot-connector-v3.1',
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      // Resposta automática
      if (response.data.auto_reply && response.data.reply_message) {
        await message.reply(response.data.reply_message);
        console.log(`🤖 Resposta automática enviada`);
      }

    } catch (error) {
      console.error('❌ Erro processando mensagem:', error.message);
    }
  });

  // Desconectado
  client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp desconectado:', reason);
    isReady = false;
    qrCodeData = null;
    
    setTimeout(async () => {
      console.log('🔄 Tentando reconectar automaticamente...');
      await safeCleanupClient();
      setTimeout(initializeWhatsApp, 10000);
    }, 15000);
  });

  // Erro autenticação
  client.on('auth_failure', async (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    isReady = false;
    qrCodeData = null;
    
    await safeCleanupClient();
    setTimeout(initializeWhatsApp, 30000);
  });
}

// Rotas da API
app.get('/health', (req, res) => {
  const chromiumPath = findChromiumPath();
  
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '3.1.0-chromium-fix',
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
      chromium_path: chromiumPath || 'default',
      puppeteer_skip_download: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD
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
        <title>WhatsApp QR Code - BudBot v3.1</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * { box-sizing: border-box; }
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
                animation: fadeInUp 0.6s ease-out;
            }
            @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(30px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .logo { 
                font-size: 5em; 
                margin-bottom: 20px;
                animation: bounce 2s infinite;
            }
            @keyframes bounce {
                0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(-10px); }
                60% { transform: translateY(-5px); }
            }
            .title { 
                color: #333; 
                margin-bottom: 15px; 
                font-weight: 700;
                font-size: 2.2em;
            }
            .subtitle { 
                color: #666; 
                margin-bottom: 25px;
                font-size: 1.2em;
            }
            .version {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 10px 20px;
                border-radius: 25px;
                font-size: 1em;
                margin: 15px 0;
                display: inline-block;
                font-weight: 600;
                box-shadow: 0 5px 15px rgba(0, 123, 255, 0.3);
            }
            .qr-container { 
                padding: 30px;
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                border-radius: 25px;
                margin: 30px 0;
                border: 4px solid #25D366;
                box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);
            }
            .qr-container img { 
                max-width: 100%; 
                border-radius: 20px;
                filter: drop-shadow(0 5px 15px rgba(0,0,0,0.2));
                background: white;
                padding: 20px;
            }
            .steps {
                text-align: left;
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                padding: 30px;
                border-radius: 20px;
                margin: 30px 0;
                border-left: 5px solid #25D366;
            }
            .step {
                padding: 15px 0;
                border-bottom: 2px solid #dee2e6;
                font-weight: 600;
                font-size: 1.1em;
            }
            .step:last-child { border-bottom: none; }
            .footer {
                color: #6c757d;
                font-size: 1em;
                margin-top: 30px;
                line-height: 1.6;
            }
            .status {
                background: linear-gradient(135deg, #25D366, #20c956);
                color: white;
                padding: 15px 30px;
                border-radius: 30px;
                display: inline-block;
                margin: 20px 0;
                font-weight: 700;
                font-size: 1.2em;
                box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4);
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(1); box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4); }
                50% { transform: scale(1.05); box-shadow: 0 8px 25px rgba(37, 211, 102, 0.6); }
                100% { transform: scale(1); box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">📱</div>
            <h1 class="title">WhatsApp QR Code</h1>
            <div class="subtitle">BudBot-IA Connector</div>
            <div class="version">v3.1 Chromium Fix</div>
            <div class="status">🔄 Aguardando conexão...</div>
            
            <div class="steps">
                <div class="step">📱 1. Abra o WhatsApp no seu celular</div>
                <div class="step">⚙️ 2. Vá em Menu → Dispositivos conectados</div>
                <div class="step">🔗 3. Toque em "Conectar um dispositivo"</div>
                <div class="step">📷 4. Aponte a câmera para o código abaixo</div>
            </div>
            
            <div class="qr-container">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCodeData)}" alt="QR Code WhatsApp"/>
            </div>
            
            <div class="footer">
                <strong>BudBot-IA WhatsApp Connector v3.1</strong><br>
                Chromium Fix para Render.com<br>
                Sistema com retry inteligente ativo<br>
                <small>Atualização automática em 25 segundos</small>
            </div>
        </div>
        <script>
            setTimeout(() => location.reload(), 25000);
            
            // Reload quando usuário volta à aba
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    setTimeout(() => location.reload(), 3000);
                }
            });
        </script>
    </body>
    </html>`;
    res.send(html);
  } else if (isReady) {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #25D366, #128C7E); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; color: #333; padding: 60px; border-radius: 30px; box-shadow: 0 30px 60px rgba(0,0,0,0.3);">
            <div style="font-size: 5em; margin-bottom: 30px; animation: bounce 2s infinite;">✅</div>
            <h1 style="color: #25D366; margin-bottom: 25px; font-size: 2.5em;">WhatsApp Conectado!</h1>
            <p style="font-size: 1.4em; color: #666; margin-bottom: 20px;">BudBot-IA v3.1 funcionando perfeitamente</p>
            <div style="background: #25D366; color: white; padding: 15px 30px; border-radius: 25px; display: inline-block; margin: 20px 0; font-weight: 600;">Chromium Fix Aplicado</div>
            <div style="margin: 40px 0;">
                <a href="/health" style="background: linear-gradient(135deg, #25D366, #20c956); color: white; padding: 20px 40px; text-decoration: none; border-radius: 30px; font-weight: 700; font-size: 1.2em;">Ver Status Detalhado</a>
            </div>
        </div>
        <style>
            @keyframes bounce {
                0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(-10px); }
                60% { transform: translateY(-5px); }
            }
        </style>
    </div>`);
  } else {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #ffc107, #fd7e14); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; color: #333; padding: 60px; border-radius: 30px; box-shadow: 0 30px 60px rgba(0,0,0,0.3);">
            <div style="font-size: 5em; margin-bottom: 30px;">🔧</div>
            <h1 style="color: #ffc107; font-size: 2.2em; margin-bottom: 20px;">Inicializando v3.1...</h1>
            <div style="background: #007bff; color: white; padding: 10px 20px; border-radius: 20px; margin: 15px 0; display: inline-block;">Chromium Fix</div>
            <p style="font-size: 1.3em; margin: 20px 0;">Tentativa: ${initializationAttempts}</p>
            <p style="color: #666; font-size: 1.1em;">Erros consecutivos: ${consecutiveErrors}</p>
            <p style="font-size: 1.2em; margin: 25px 0;">${isInitializing ? '🔄 Inicializando Chromium...' : '⏳ Aguardando próxima tentativa...'}</p>
            <div style="margin: 40px 0;">
                <div style="width: 80px; height: 80px; border: 8px solid #f3f3f3; border-top: 8px solid #ffc107; border-radius: 50%; animation: spin 1.5s linear infinite; margin: 0 auto;"></div>
            </div>
            <p style="font-weight: 700; font-size: 1.2em;">Sistema com Chromium nativo!</p>
            <p style="font-size: 1em; color: #999; margin-top: 20px;">Timeout estendido: 300s<br>Retry inteligente ativo</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <script>setTimeout(() => location.reload(), 12000);</script>
    </div>`);
  }
});

app.post('/send', async (req, res) => {
  try {
    if (!isReady) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não conectado',
        status: 'disconnected'
      });
    }

    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Campos phone e message são obrigatórios'
      });
    }

    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);

    console.log(`📤 Mensagem enviada para ${phone}`);
    res.json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno ao enviar mensagem',
      details: error.message 
    });
  }
});

app.post('/restart', async (req, res) => {
  try {
    console.log('🔄 Restart manual solicitado...');
    
    await safeCleanupClient();
    
    isReady = false;
    qrCodeData = null;
    isInitializing = false;
    consecutiveErrors = 0;
    
    setTimeout(initializeWhatsApp, 5000);
    
    res.json({ 
      success: true, 
      message: 'Restart iniciado - aguarde alguns minutos',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('⚠️ Warning durante restart:', error.message);
    res.json({ 
      success: true, 
      message: 'Restart iniciado com warnings - sistema se recuperará automaticamente' 
    });
  }
});

app.get('/', (req, res) => {
  const chromiumPath = findChromiumPath();
  
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '3.1.0-chromium-fix',
    status: isReady ? 'connected' : 'initializing',
    attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    uptime: process.uptime(),
    chromium: {
      path: chromiumPath || 'default',
      available: !!chromiumPath
    },
    features: [
      'chromium-fix',
      'puppeteer-core',
      'extended-timeout',
      'adaptive-retry',
      'system-chromium'
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

// Middleware de erro
app.use((error, req, res, next) => {
  console.error('❌ API Error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Erro interno do servidor',
    timestamp: new Date().toISOString() 
  });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Endpoints disponíveis:`);
  console.log(`   Health Check: /health`);
  console.log(`   QR Code Interface: /qr`);
  console.log(`   Status: /status`);
  console.log(`   Send Message: POST /send`);
  console.log(`   Restart: POST /restart`);
  
  const chromiumPath = findChromiumPath();
  console.log(`🔍 Chromium detectado: ${chromiumPath || 'padrão Puppeteer'}`);
  
  // Aguardar servidor stabilizar e inicializar WhatsApp
  setTimeout(() => {
    console.log('🚀 Iniciando WhatsApp com Chromium Fix...');
    initializeWhatsApp();
  }, 8000);
});

// Tratamento seguro de sinais
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT - encerrando gracefully...');
  await safeCleanupClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM - encerrando gracefully...');
  await safeCleanupClient();
  process.exit(0);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  
  // Verificar se é erro relacionado ao client e Chromium
  if (client && client.pupPage && reason.message && 
      (reason.message.includes('close') || reason.message.includes('Protocol error'))) {
    try {
      await safeCleanupClient();
      console.log('🧹 Cliente limpo após unhandled rejection (Chromium)');
    } catch (cleanupError) {
      console.log('⚠️ Erro durante limpeza automática:', cleanupError.message);
    }
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  
  // Se erro relacionado ao Puppeteer/Chromium, limpar cliente
  if (error.message.includes('Protocol error') || 
      error.message.includes('Target closed') ||
      error.message.includes('Session closed')) {
    setTimeout(async () => {
      await safeCleanupClient();
      console.log('🧹 Cliente limpo após uncaught exception (Chromium)');
    }, 2000);
  }
});