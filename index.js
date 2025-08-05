#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector v2.0
 * Versão otimizada com retry infinito
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

console.log('🚀 BudBot WhatsApp Connector v2.0');
console.log('- BUDBOT_API_URL:', BUDBOT_API_URL);
console.log('- PORT:', PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);

// Estado do cliente WhatsApp
let client;
let isReady = false;
let qrCodeData = null;
let initializationAttempts = 0;
let isInitializing = false;

// Função para aguardar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configuração Puppeteer simplificada
function getPuppeteerConfig() {
  return {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--no-first-run',
      '--single-process',
      '--disable-extensions'
    ]
  };
}

// Inicializar WhatsApp com retry infinito
async function initializeWhatsApp() {
  if (isInitializing) {
    console.log('⚠️ Inicialização já em andamento, aguardando...');
    return;
  }

  isInitializing = true;
  initializationAttempts++;
  
  console.log(`🔄 Inicializando WhatsApp (tentativa ${initializationAttempts})...`);
  
  try {
    // Limpar cliente anterior
    if (client) {
      try {
        await client.destroy();
        console.log('🧹 Cliente anterior removido');
      } catch (error) {
        console.log('⚠️ Erro ao limpar cliente:', error.message);
      }
    }
    
    // Aguardar progressivo
    const waitTime = Math.min(10000, 2000 * initializationAttempts);
    console.log(`⏳ Aguardando ${waitTime/1000}s antes de tentar...`);
    await sleep(waitTime);
    
    // Criar novo cliente
    client = new Client({
      authStrategy: new LocalAuth({
        name: `budbot-${Date.now()}`,
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: getPuppeteerConfig(),
      takeoverOnConflict: true,
      takeoverTimeoutMs: 5000
    });

    // Configurar eventos
    setupWhatsAppEvents();
    
    // Inicializar com timeout
    console.log('📱 Inicializando cliente WhatsApp...');
    await Promise.race([
      client.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout 120s')), 120000)
      )
    ]);
    
    console.log('✅ Cliente inicializado com sucesso!');
    
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
    
    // Retry automático infinito
    const retryDelay = Math.min(60000, 5000 * Math.min(initializationAttempts, 10));
    console.log(`🔄 Nova tentativa em ${retryDelay/1000}s...`);
    
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
    console.log('📱 QR Code gerado! Acesse /qr');
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
  });

  // Cliente pronto
  client.on('ready', () => {
    console.log('✅ WhatsApp conectado!');
    isReady = true;
    qrCodeData = null;
    initializationAttempts = 0; // Reset on success
  });

  // Autenticado
  client.on('authenticated', () => {
    console.log('🔐 Autenticado!');
  });

  // Loading
  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Carregando: ${percent}% - ${message}`);
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
          'X-WhatsApp-Connector': 'budbot-connector-v2',
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      // Resposta automática
      if (response.data.auto_reply && response.data.reply_message) {
        await message.reply(response.data.reply_message);
        console.log(`🤖 Resposta enviada: ${messageData.phone}`);
      }

    } catch (error) {
      console.error('❌ Erro mensagem:', error.message);
    }
  });

  // Desconectado
  client.on('disconnected', (reason) => {
    console.log('⚠️ Desconectado:', reason);
    isReady = false;
    qrCodeData = null;
    
    // Reconectar automaticamente
    setTimeout(() => {
      console.log('🔄 Reconectando...');
      initializeWhatsApp();
    }, 5000);
  });

  // Erro autenticação
  client.on('auth_failure', (msg) => {
    console.error('❌ Falha autenticação:', msg);
    isReady = false;
    qrCodeData = null;
    
    // Tentar novamente
    setTimeout(() => {
      initializeWhatsApp();
    }, 10000);
  });
}

// Rotas da API
app.get('/health', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '2.0.0',
    status: 'online',
    whatsapp_ready: isReady,
    has_qr: qrCodeData !== null,
    initialization_attempts: initializationAttempts,
    is_initializing: isInitializing,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      budbot_url: BUDBOT_API_URL
    }
  });
});

app.get('/status', (req, res) => {
  res.json({
    connected: isReady,
    has_qr: qrCodeData !== null,
    attempts: initializationAttempts,
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
        <title>WhatsApp QR Code - BudBot v2.0</title>
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
            .version {
                background: #007bff;
                color: white;
                padding: 5px 10px;
                border-radius: 10px;
                font-size: 0.8em;
                margin: 5px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">📱</div>
            <h1 class="title">WhatsApp QR Code</h1>
            <div class="subtitle">BudBot-IA Connector</div>
            <div class="version">v2.0 - Otimizado</div>
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
                <strong>BudBot-IA WhatsApp Connector v2.0</strong><br>
                Retry infinito ativo - Atualização em 15s
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
            <p>BudBot-IA v2.0 está funcionando perfeitamente.</p>
            <a href="/health" style="background: #25D366; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px;">Ver Status</a>
        </div>
    </div>`);
  } else {
    res.send(`
    <div style="text-align: center; padding: 50px; background: linear-gradient(135deg, #ffc107, #fd7e14); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; color: #333; padding: 40px; border-radius: 20px;">
            <h1 style="color: #ffc107;">🔄 Inicializando v2.0...</h1>
            <p>Tentativa: ${initializationAttempts} (retry infinito ativo)</p>
            <p>${isInitializing ? 'Inicializando agora...' : 'Aguardando próxima tentativa...'}</p>
            <div style="margin: 20px 0; font-size: 2em;">⏳</div>
            <p><strong>Sistema nunca para de tentar!</strong></p>
        </div>
        <script>setTimeout(() => location.reload(), 8000);</script>
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

    console.log(`📤 Enviado: ${phone}`);
    res.json({ success: true, message: 'Enviado' });

  } catch (error) {
    console.error('❌ Erro envio:', error.message);
    res.status(500).json({ success: false, error: 'Erro envio' });
  }
});

app.post('/restart', async (req, res) => {
  try {
    console.log('🔄 Reiniciando...');
    
    if (client) {
      await client.destroy();
    }
    
    isReady = false;
    qrCodeData = null;
    initializationAttempts = 0;
    isInitializing = false;
    
    setTimeout(initializeWhatsApp, 2000);
    
    res.json({ success: true, message: 'Reiniciado' });
  } catch (error) {
    res.json({ success: true, message: 'Reiniciado com warning' });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'BudBot WhatsApp Connector',
    version: '2.0.0',
    status: isReady ? 'connected' : 'initializing',
    attempts: initializationAttempts,
    uptime: process.uptime(),
    features: ['retry-infinito', 'qr-visual', 'auto-reconnect'],
    endpoints: ['/health', '/status', '/qr', '/send', '/restart']
  });
});

// Middleware de erro
app.use((error, req, res, next) => {
  console.error('❌ Erro API:', error);
  res.status(500).json({ success: false, error: 'Erro interno' });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor ativo na porta ${PORT}`);
  console.log(`🔗 Endpoints:`);
  console.log(`   Health: /health`);
  console.log(`   QR Code: /qr`);
  console.log(`   Status: /status`);
  
  // Inicializar WhatsApp
  setTimeout(() => {
    console.log('🚀 Iniciando WhatsApp com retry infinito...');
    initializeWhatsApp();
  }, 3000);
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
  // Não encerrar o processo, tentar continuar
});