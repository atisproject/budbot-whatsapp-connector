#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector v3.0
 * Otimizado específicamente para Render.com
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

console.log('🚀 BudBot WhatsApp Connector v3.0 - Render.com Optimized');
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

// Configuração Puppeteer específica para Render.com
function getPuppeteerConfig() {
  const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
  
  const config = {
    headless: true,
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

  if (isRender) {
    config.executablePath = '/usr/bin/chromium-browser';
    config.args.push(
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--single-process'
    );
  }

  return config;
}

// Limpeza segura do cliente
async function safeCleanupClient() {
  if (!client) return;
  
  try {
    // Verificar propriedades específicas antes de tentar destruir
    if (client.pupPage && typeof client.pupPage.close === 'function') {
      await client.pupPage.close();
    }
    
    if (client.pupBrowser && typeof client.pupBrowser.close === 'function') {
      await client.pupBrowser.close();
    }
    
    // Só chamar destroy se cliente está devidamente inicializado
    if (client && typeof client.destroy === 'function' && client.pupPage) {
      await client.destroy();
    }
  } catch (error) {
    // Ignorar erros de limpeza mas logar para debug
    console.log('⚠️ Warning durante limpeza (ignorado):', error.message);
  } finally {
    client = null;
  }
}

// Inicializar WhatsApp com estratégia adaptativa
async function initializeWhatsApp() {
  if (isInitializing) {
    console.log('⚠️ Inicialização já em andamento...');
    return;
  }

  isInitializing = true;
  initializationAttempts++;
  
  // Estratégia de backoff adaptativo
  const now = Date.now();
  if (now - lastErrorTime < 60000) {
    consecutiveErrors++;
  } else {
    consecutiveErrors = 0;
  }
  lastErrorTime = now;

  const waitTime = Math.min(120000, Math.max(5000, consecutiveErrors * 10000));
  
  console.log(`🔄 Tentativa ${initializationAttempts} (erros consecutivos: ${consecutiveErrors})`);
  console.log(`⏳ Aguardando ${waitTime/1000}s...`);
  
  await sleep(waitTime);
  
  try {
    // Limpeza completa antes de tentar
    await safeCleanupClient();
    await sleep(2000);
    
    console.log('📱 Criando novo cliente WhatsApp...');
    
    // Criar cliente com configuração específica para Render.com
    client = new Client({
      authStrategy: new LocalAuth({
        name: `budbot-session-${Date.now()}`,
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: getPuppeteerConfig(),
      takeoverOnConflict: true,
      takeoverTimeoutMs: 10000,
      restartOnAuthFail: false,
      qrMaxRetries: 3
    });

    // Configurar eventos primeiro
    setupWhatsAppEvents();
    
    console.log('🔧 Inicializando com timeout estendido...');
    
    // Promise de inicialização com timeout aumentado
    await Promise.race([
      client.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout de 180s')), 180000)
      )
    ]);
    
    console.log('✅ Cliente inicializado - aguardando eventos...');
    
  } catch (error) {
    console.error(`❌ Erro tentativa ${initializationAttempts}:`, error.message);
    
    // Limpeza após erro
    await safeCleanupClient();
    
    // Determinar delay para próxima tentativa
    let retryDelay;
    if (error.message.includes('Protocol error') || error.message.includes('Session closed')) {
      retryDelay = Math.min(180000, 30000 + (consecutiveErrors * 15000));
      console.log(`🔄 Erro de protocolo - nova tentativa em ${retryDelay/1000}s`);
    } else {
      retryDelay = Math.min(300000, 60000 + (consecutiveErrors * 30000));
      console.log(`🔄 Erro geral - nova tentativa em ${retryDelay/1000}s`);
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
    consecutiveErrors = 0; // Reset on QR generation
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
    console.log('🔐 Autenticação realizada!');
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
          'X-WhatsApp-Connector': 'budbot-connector-v3',
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
      console.log('🔄 Tentando reconectar...');
      await safeCleanupClient();
      setTimeout(initializeWhatsApp, 5000);
    }, 10000);
  });

  // Erro autenticação
  client.on('auth_failure', async (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    isReady = false;
    qrCodeData = null;
    
    await safeCleanupClient();
    setTimeout(initializeWhatsApp, 15000);
  });
}

// Rotas da API
app.get('/health', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '3.0.0-render',
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
      render_detected: !!(process.env.RENDER || process.env.NODE_ENV === 'production')
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
        <title>WhatsApp QR Code - BudBot v3.0</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
                margin: 0; 
                padding: 20px;
                background: linear-gradient(135deg, #25D366, #128C7E);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container { 
                background: white; 
                padding: 40px; 
                border-radius: 20px; 
                box-shadow: 0 25px 50px rgba(0,0,0,0.15);
                text-align: center;
                max-width: 500px;
                width: 100%;
                animation: fadeIn 0.5s ease-in;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .logo { font-size: 4em; margin-bottom: 20px; }
            .title { color: #333; margin-bottom: 10px; font-weight: 600; }
            .subtitle { color: #666; margin-bottom: 20px; }
            .version {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 0.9em;
                margin: 10px 0;
                display: inline-block;
                font-weight: 500;
            }
            .qr-container { 
                padding: 25px;
                background: #f8f9fa;
                border-radius: 20px;
                margin: 25px 0;
                border: 3px solid #25D366;
            }
            .qr-container img { 
                max-width: 100%; 
                border-radius: 15px;
                filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));
            }
            .steps {
                text-align: left;
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                padding: 25px;
                border-radius: 15px;
                margin: 25px 0;
            }
            .step {
                padding: 12px 0;
                border-bottom: 1px solid #dee2e6;
                font-weight: 500;
            }
            .step:last-child { border-bottom: none; }
            .footer {
                color: #6c757d;
                font-size: 0.9em;
                margin-top: 25px;
                line-height: 1.5;
            }
            .status {
                background: linear-gradient(135deg, #25D366, #20c956);
                color: white;
                padding: 12px 24px;
                border-radius: 25px;
                display: inline-block;
                margin: 15px 0;
                font-weight: 600;
                box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);
            }
            .pulse {
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">📱</div>
            <h1 class="title">WhatsApp QR Code</h1>
            <div class="subtitle">BudBot-IA Connector</div>
            <div class="version">v3.0 Render Optimized</div>
            <div class="status pulse">🔄 Aguardando conexão...</div>
            
            <div class="steps">
                <div class="step">📱 1. Abra o WhatsApp no seu celular</div>
                <div class="step">⚙️ 2. Vá em Menu → Dispositivos conectados</div>
                <div class="step">🔗 3. Toque em "Conectar um dispositivo"</div>
                <div class="step">📷 4. Aponte a câmera para o código abaixo</div>
            </div>
            
            <div class="qr-container">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrCodeData)}" alt="QR Code WhatsApp"/>
            </div>
            
            <div class="footer">
                <strong>BudBot-IA WhatsApp Connector v3.0</strong><br>
                Otimizado para Render.com - Retry inteligente ativo<br>
                Atualização automática em 20 segundos
            </div>
        </div>
        <script>
            setTimeout(() => location.reload(), 20000);
            
            // Detectar quando usuário volta à aba
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    setTimeout(() => location.reload(), 2000);
                }
            });
        </script>
    </body>
    </html>`;
    res.send(html);
  } else if (isReady) {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #25D366, #128C7E); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; color: #333; padding: 50px; border-radius: 25px; box-shadow: 0 25px 50px rgba(0,0,0,0.2);">
            <div style="font-size: 4em; margin-bottom: 20px;">✅</div>
            <h1 style="color: #25D366; margin-bottom: 20px;">WhatsApp Conectado!</h1>
            <p style="font-size: 1.2em; color: #666;">BudBot-IA v3.0 está funcionando perfeitamente</p>
            <div style="margin: 30px 0;">
                <a href="/health" style="background: linear-gradient(135deg, #25D366, #20c956); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: 600;">Ver Status Detalhado</a>
            </div>
        </div>
    </div>`);
  } else {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #ffc107, #fd7e14); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; color: #333; padding: 50px; border-radius: 25px; box-shadow: 0 25px 50px rgba(0,0,0,0.2);">
            <div style="font-size: 4em; margin-bottom: 20px;">⚡</div>
            <h1 style="color: #ffc107;">Inicializando v3.0...</h1>
            <p style="font-size: 1.2em;">Tentativa: ${initializationAttempts}</p>
            <p style="color: #666;">Erros consecutivos: ${consecutiveErrors}</p>
            <p>${isInitializing ? '🔄 Inicializando agora...' : '⏳ Aguardando próxima tentativa...'}</p>
            <div style="margin: 30px 0;">
                <div style="width: 60px; height: 60px; border: 6px solid #f3f3f3; border-top: 6px solid #ffc107; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
            </div>
            <p><strong>Sistema com retry inteligente ativo!</strong></p>
            <p style="font-size: 0.9em; color: #999;">Render.com Optimized</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <script>setTimeout(() => location.reload(), 10000);</script>
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
    
    setTimeout(initializeWhatsApp, 3000);
    
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
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '3.0.0-render',
    status: isReady ? 'connected' : 'initializing',
    attempts: initializationAttempts,
    consecutive_errors: consecutiveErrors,
    uptime: process.uptime(),
    features: [
      'render-optimized',
      'adaptive-retry',
      'protocol-error-recovery',
      'safe-cleanup',
      'enhanced-ui'
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
  
  // Aguardar servidor stabilizar e inicializar WhatsApp
  setTimeout(() => {
    console.log('🚀 Iniciando WhatsApp com estratégia adaptativa...');
    initializeWhatsApp();
  }, 5000);
});

// Tratamento seguro de sinais
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT recebido - encerrando gracefully...');
  await safeCleanupClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM recebido - encerrando gracefully...');
  await safeCleanupClient();
  process.exit(0);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  
  // Verificar se é erro relacionado ao client antes de tentar limpeza
  if (client && client.pupPage && reason.message && reason.message.includes('close')) {
    try {
      await safeCleanupClient();
      console.log('🧹 Cliente limpo após unhandled rejection');
    } catch (cleanupError) {
      console.log('⚠️ Erro durante limpeza automática:', cleanupError.message);
    }
  }
  
  // Não encerrar processo - deixar sistema se recuperar
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  
  // Se erro relacionado ao Puppeteer, limpar cliente
  if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
    setTimeout(async () => {
      await safeCleanupClient();
      console.log('🧹 Cliente limpo após uncaught exception');
    }, 1000);
  }
  
  // Log mas não encerrar - sistema deve continuar tentando
});