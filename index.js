#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector
 * Versão Node.js nativo para Render.com
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configurações
const BUDBOT_API_URL = process.env.BUDBOT_API_URL || 'http://localhost:5000';
const API_SECRET = process.env.API_SECRET || 'budbot-secret-key';

console.log('🔧 Configurações WhatsApp Connector:');
console.log('- BUDBOT_API_URL:', BUDBOT_API_URL);
console.log('- PORT:', PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- RENDER:', process.env.RENDER ? 'Sim' : 'Não');

// Estado do cliente WhatsApp
let client;
let isReady = false;
let qrCodeData = null;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 5;

// Função para aguardar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Detectar caminho do Chrome
function getChromePath() {
  const possiblePaths = [
    '/opt/render/project/.render/chrome/opt/google/chrome/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/opt/google/chrome/google-chrome',
    'google-chrome-stable',
    'google-chrome',
    'chromium-browser',
    'chromium'
  ];

  for (const chromePath of possiblePaths) {
    try {
      if (fs.existsSync(chromePath)) {
        console.log(`✅ Chrome encontrado em: ${chromePath}`);
        return chromePath;
      }
    } catch (error) {
      // Continue procurando
    }
  }

  console.log('⚠️ Chrome não encontrado, usando padrão do sistema');
  return null;
}

// Configuração Puppeteer otimizada
function getPuppeteerConfig() {
  const chromePath = getChromePath();
  
  const config = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-field-trial-config',
      '--disable-back-forward-cache',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-translate',
      '--disable-ipc-flooding-protection',
      '--no-default-browser-check',
      '--no-pings',
      '--no-service-autorun',
      '--password-store=basic',
      '--use-mock-keychain',
      '--hide-scrollbars',
      '--mute-audio',
      '--disable-notifications',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-client-side-phishing-detection',
      '--disable-sync-preferences',
      '--disable-web-resources',
      '--safebrowsing-disable-auto-update',
      '--disable-domain-reliability'
    ]
  };

  if (chromePath) {
    config.executablePath = chromePath;
  }

  console.log(`🚀 Configuração Puppeteer:`, {
    headless: config.headless,
    executablePath: config.executablePath || 'Sistema',
    args: config.args.length + ' argumentos'
  });

  return config;
}

// Inicializar WhatsApp com retry robusto
async function initializeWhatsApp() {
  initializationAttempts++;
  console.log(`🚀 Iniciando WhatsApp Connector (tentativa ${initializationAttempts}/${MAX_INIT_ATTEMPTS})...`);
  
  try {
    // Aguardar antes de tentar
    await sleep(3000 * initializationAttempts);
    
    // Verificar se cliente anterior existe
    if (client) {
      try {
        await client.destroy();
        console.log('🧹 Cliente anterior limpo');
      } catch (error) {
        console.log('⚠️ Erro ao limpar cliente anterior:', error.message);
      }
    }
    
    // Criar novo cliente
    console.log('📱 Criando novo cliente WhatsApp...');
    client = new Client({
      authStrategy: new LocalAuth({
        name: `budbot-session-${Date.now()}`,
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: getPuppeteerConfig(),
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0
    });

    // Configurar eventos
    setupWhatsAppEvents();
    
    // Inicializar com timeout
    console.log('⏳ Inicializando cliente WhatsApp...');
    
    const initPromise = client.initialize();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout na inicialização (60s)')), 60000);
    });
    
    await Promise.race([initPromise, timeoutPromise]);
    
    console.log('🎉 Cliente WhatsApp inicializado com sucesso!');
    
  } catch (error) {
    console.error(`❌ Erro na tentativa ${initializationAttempts}:`, error.message);
    
    // Limpar cliente com erro
    if (client) {
      try {
        await client.destroy();
      } catch (cleanupError) {
        console.log('⚠️ Erro na limpeza:', cleanupError.message);
      }
      client = null;
    }
    
    if (initializationAttempts < MAX_INIT_ATTEMPTS) {
      const waitTime = Math.min(30000, 5000 * initializationAttempts);
      console.log(`🔄 Tentando novamente em ${waitTime/1000}s...`);
      setTimeout(() => {
        initializeWhatsApp();
      }, waitTime);
    } else {
      console.error('💥 Máximo de tentativas atingido. WhatsApp Connector em modo limitado.');
    }
  }
}

// Configurar eventos do WhatsApp
function setupWhatsAppEvents() {
  if (!client) return;

  // Evento: QR Code
  client.on('qr', (qr) => {
    console.log('📱 QR Code gerado! Acesse /qr para visualizar');
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
  });

  // Evento: Cliente pronto
  client.on('ready', () => {
    console.log('✅ WhatsApp conectado com sucesso!');
    isReady = true;
    qrCodeData = null;
    initializationAttempts = 0;
  });

  // Evento: Autenticado
  client.on('authenticated', () => {
    console.log('🔐 WhatsApp autenticado!');
  });

  // Evento: Loading
  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Carregando WhatsApp: ${percent}% - ${message}`);
  });

  // Evento: Mensagem recebida
  client.on('message', async (message) => {
    try {
      if (message.from.includes('@g.us')) {
        // Ignorar mensagens de grupo
        return;
      }

      const contact = await message.getContact();
      const messageData = {
        phone: message.from.replace('@c.us', ''),
        message: message.body,
        contact_name: contact.pushname || contact.name || null,
        whatsapp_message_id: message.id.id,
        timestamp: new Date().toISOString()
      };

      console.log(`📨 Mensagem: ${messageData.phone} - ${messageData.message}`);

      // Enviar para BudBot-IA
      const response = await axios.post(`${BUDBOT_API_URL}/api/whatsapp-connector/receive`, messageData, {
        headers: {
          'Authorization': `Bearer ${API_SECRET}`,
          'X-WhatsApp-Connector': 'budbot-connector-v1',
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      // Resposta automática
      if (response.data.auto_reply && response.data.reply_message) {
        await message.reply(response.data.reply_message);
        console.log(`🤖 Resposta enviada para ${messageData.phone}`);
      }

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error.message);
    }
  });

  // Evento: Desconectado
  client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp desconectado:', reason);
    isReady = false;
    qrCodeData = null;
    
    // Reconexão automática
    setTimeout(() => {
      console.log('🔄 Tentando reconectar...');
      initializeWhatsApp();
    }, 10000);
  });

  // Evento: Erro de autenticação
  client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    isReady = false;
    qrCodeData = null;
  });
}

// Rotas da API
app.get('/health', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    status: 'online',
    whatsapp_ready: isReady,
    has_qr: qrCodeData !== null,
    initialization_attempts: initializationAttempts,
    max_attempts: MAX_INIT_ATTEMPTS,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      render: !!process.env.RENDER,
      budbot_url: BUDBOT_API_URL,
      chrome_path: getChromePath() || 'Sistema'
    }
  });
});

app.get('/status', (req, res) => {
  res.json({
    connected: isReady,
    has_qr: qrCodeData !== null,
    attempts: initializationAttempts,
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
        <title>WhatsApp QR Code - BudBot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { 
                font-family: Arial, sans-serif; 
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
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                text-align: center;
                max-width: 500px;
                width: 100%;
            }
            .logo { font-size: 3em; margin-bottom: 20px; }
            .title { color: #333; margin-bottom: 10px; }
            .subtitle { color: #666; margin-bottom: 30px; }
            .qr-container { 
                padding: 20px;
                background: #f8f9fa;
                border-radius: 15px;
                margin: 20px 0;
            }
            .qr-container img { 
                max-width: 100%; 
                border-radius: 10px;
                border: 2px solid #25D366;
            }
            .steps {
                text-align: left;
                background: #f8f9fa;
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
            }
            .step {
                padding: 8px 0;
                border-bottom: 1px solid #eee;
            }
            .step:last-child { border-bottom: none; }
            .footer {
                color: #999;
                font-size: 0.9em;
                margin-top: 20px;
            }
            .status {
                background: #25D366;
                color: white;
                padding: 10px 20px;
                border-radius: 20px;
                display: inline-block;
                margin: 10px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">📱</div>
            <h1 class="title">WhatsApp QR Code</h1>
            <div class="subtitle">BudBot-IA Connector</div>
            <div class="status">🔄 Aguardando conexão...</div>
            
            <div class="steps">
                <div class="step">📱 1. Abra o WhatsApp no celular</div>
                <div class="step">⚙️ 2. Menu → Dispositivos conectados</div>
                <div class="step">🔗 3. Conectar um dispositivo</div>
                <div class="step">📷 4. Escaneie o código abaixo</div>
            </div>
            
            <div class="qr-container">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}" alt="QR Code"/>
            </div>
            
            <div class="footer">
                <strong>BudBot-IA WhatsApp Connector</strong><br>
                Atualização automática em 15 segundos
            </div>
        </div>
        <script>
            setTimeout(() => location.reload(), 15000);
        </script>
    </body>
    </html>`;
    res.send(html);
  } else if (isReady) {
    res.send(`
    <div style="text-align: center; padding: 50px; background: #25D366; color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; color: #333; padding: 40px; border-radius: 20px;">
            <h1 style="color: #25D366;">✅ WhatsApp Conectado!</h1>
            <p>O BudBot-IA está pronto para receber mensagens.</p>
            <a href="/health" style="background: #25D366; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px;">Ver Status</a>
        </div>
    </div>`);
  } else {
    res.send(`
    <div style="text-align: center; padding: 50px; background: #ffc107; color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; color: #333; padding: 40px; border-radius: 20px;">
            <h1 style="color: #ffc107;">⏳ Inicializando...</h1>
            <p>Tentativa: ${initializationAttempts}/${MAX_INIT_ATTEMPTS}</p>
            <div style="margin: 20px 0; font-size: 2em;">🔄</div>
            <p>Aguarde alguns minutos...</p>
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
        error: 'Phone e message obrigatórios'
      });
    }

    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);

    console.log(`📤 Mensagem enviada: ${phone}`);
    res.json({ success: true, message: 'Enviado com sucesso' });

  } catch (error) {
    console.error('❌ Erro ao enviar:', error.message);
    res.status(500).json({ success: false, error: 'Erro no envio' });
  }
});

app.post('/restart', async (req, res) => {
  try {
    console.log('🔄 Reiniciando WhatsApp Connector...');
    
    if (client) {
      await client.destroy();
    }
    
    isReady = false;
    qrCodeData = null;
    initializationAttempts = 0;
    
    setTimeout(initializeWhatsApp, 3000);
    
    res.json({ success: true, message: 'Reiniciado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro no restart' });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '1.0.0',
    status: isReady ? 'connected' : 'initializing',
    endpoints: ['/health', '/status', '/qr', '/send', '/restart']
  });
});

// Tratamento de erros
app.use((error, req, res, next) => {
  console.error('❌ Erro na API:', error);
  res.status(500).json({ success: false, error: 'Erro interno' });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 BudBot WhatsApp Connector ativo na porta ${PORT}`);
  console.log(`🔗 URLs importantes:`);
  console.log(`   Health: /health`);
  console.log(`   QR Code: /qr`);
  console.log(`   Status: /status`);
  
  // Inicializar WhatsApp após servidor estar rodando
  setTimeout(() => {
    console.log('🚀 Iniciando inicialização do WhatsApp...');
    initializeWhatsApp();
  }, 5000);
});

// Tratamento de sinais
process.on('SIGINT', async () => {
  console.log('🛑 Encerrando...');
  if (client) await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Encerrando...');
  if (client) await client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});