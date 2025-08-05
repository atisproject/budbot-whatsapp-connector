#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector
 * Conecta WhatsApp Web ao sistema BudBot-IA
 * Versão otimizada para Render.com
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

console.log('🔧 Configurações:');
console.log('- BUDBOT_API_URL:', BUDBOT_API_URL);
console.log('- PORT:', PORT);
console.log('- NODE_ENV:', process.env.NODE_ENV);

// Estado do cliente WhatsApp
let client;
let isReady = false;
let qrCodeData = null;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

// Função para aguardar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configuração otimizada do Puppeteer para Render.com
function getPuppeteerConfig() {
    return {
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
            '--disable-notifications'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
    };
}

// Inicializar cliente WhatsApp com retry
async function initializeWhatsApp() {
    console.log('🚀 Iniciando WhatsApp Connector...');
    
    try {
        initializationAttempts++;
        console.log(`📱 Tentativa de inicialização: ${initializationAttempts}/${MAX_INIT_ATTEMPTS}`);
        
        // Aguardar um pouco antes de tentar
        await sleep(2000);
        
        client = new Client({
            authStrategy: new LocalAuth({
                name: 'budbot-session',
                dataPath: './.wwebjs_auth'
            }),
            puppeteer: getPuppeteerConfig()
        });

        // Configurar eventos
        setupWhatsAppEvents();
        
        // Inicializar cliente
        console.log('🔄 Inicializando cliente WhatsApp...');
        await client.initialize();
        
    } catch (error) {
        console.error('❌ Erro ao inicializar WhatsApp:', error.message);
        
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            console.log(`🔄 Tentando novamente em 10 segundos... (${initializationAttempts}/${MAX_INIT_ATTEMPTS})`);
            setTimeout(() => {
                initializeWhatsApp();
            }, 10000);
        } else {
            console.error('💥 Máximo de tentativas de inicialização atingido');
        }
    }
}

// Configurar eventos do WhatsApp
function setupWhatsAppEvents() {
    // Evento: QR Code
    client.on('qr', (qr) => {
        console.log('📱 QR Code gerado! Escaneie com seu WhatsApp:');
        console.log('🔗 QR Code disponível em: /qr');
        qrcode.generate(qr, { small: true });
        qrCodeData = qr;
    });

    // Evento: Cliente pronto
    client.on('ready', () => {
        console.log('✅ WhatsApp conectado com sucesso!');
        isReady = true;
        qrCodeData = null;
        initializationAttempts = 0; // Reset counter on success
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

            console.log(`📨 Mensagem recebida de ${messageData.phone}: ${messageData.message}`);

            // Enviar para BudBot-IA
            const response = await axios.post(`${BUDBOT_API_URL}/api/whatsapp-connector/receive`, messageData, {
                headers: {
                    'Authorization': `Bearer ${API_SECRET}`,
                    'X-WhatsApp-Connector': 'budbot-connector-v1',
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log('📡 Resposta do BudBot-IA:', response.data);

            // Verificar se há resposta automática
            if (response.data.auto_reply && response.data.reply_message) {
                await message.reply(response.data.reply_message);
                console.log(`🤖 Resposta automática enviada para ${messageData.phone}`);
            }

        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error.message);
            if (error.response) {
                console.error('📡 Erro HTTP:', error.response.status, error.response.data);
            }
        }
    });

    // Evento: Cliente desconectado
    client.on('disconnected', (reason) => {
        console.log('⚠️ WhatsApp desconectado:', reason);
        isReady = false;
        qrCodeData = null;
        
        // Tentar reconectar após desconexão
        setTimeout(() => {
            console.log('🔄 Tentando reconectar...');
            initializeWhatsApp();
        }, 5000);
    });

    // Evento: Erro de autenticação
    client.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação:', msg);
        isReady = false;
        qrCodeData = null;
    });

    // Evento: Loading screen
    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ Carregando: ${percent}% - ${message}`);
    });

    // Evento: Authenticating
    client.on('authenticated', () => {
        console.log('🔐 Autenticado com sucesso!');
    });
}

// Rotas da API
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        whatsapp_ready: isReady,
        has_qr: qrCodeData !== null,
        initialization_attempts: initializationAttempts,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
        config: {
            budbot_url: BUDBOT_API_URL,
            node_env: process.env.NODE_ENV,
            puppeteer_path: process.env.PUPPETEER_EXECUTABLE_PATH
        }
    });
});

app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        has_qr: qrCodeData !== null,
        initialization_attempts: initializationAttempts,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/qr', (req, res) => {
    if (qrCodeData) {
        // Retornar página HTML simples com QR Code
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code - BudBot Connector</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { 
                    font-family: 'Segoe UI', Arial, sans-serif; 
                    text-align: center; 
                    padding: 20px; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .container { 
                    max-width: 500px; 
                    background: white; 
                    padding: 40px; 
                    border-radius: 20px; 
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                .logo { font-size: 2.5em; margin-bottom: 10px; }
                .title { color: #333; margin-bottom: 20px; font-weight: 300; }
                .status { 
                    background: #28a745; 
                    color: white; 
                    padding: 10px 20px; 
                    border-radius: 25px; 
                    display: inline-block; 
                    margin-bottom: 20px;
                    font-weight: bold;
                }
                .instructions { 
                    color: #666; 
                    margin: 20px 0; 
                    line-height: 1.6;
                }
                .step {
                    background: #f8f9fa;
                    padding: 10px;
                    margin: 5px 0;
                    border-radius: 8px;
                    border-left: 4px solid #007bff;
                }
                .qr-container { 
                    margin: 30px auto; 
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 15px;
                }
                img { 
                    max-width: 100%; 
                    border: 2px solid #ddd; 
                    border-radius: 10px; 
                }
                .footer {
                    color: #999;
                    font-size: 0.9em;
                    margin-top: 20px;
                }
                .spinner {
                    animation: spin 2s linear infinite;
                    display: inline-block;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">📱</div>
                <h1 class="title">WhatsApp QR Code</h1>
                <div class="status">
                    <span class="spinner">🔄</span> Aguardando conexão...
                </div>
                <div class="instructions">
                    <div class="step">1. Abra o WhatsApp no seu celular</div>
                    <div class="step">2. Vá em <strong>Menu → Dispositivos conectados</strong></div>
                    <div class="step">3. Toque em <strong>Conectar um dispositivo</strong></div>
                    <div class="step">4. Escaneie o QR Code abaixo</div>
                </div>
                <div class="qr-container">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}" alt="QR Code"/>
                </div>
                <div class="footer">
                    <p>🤖 <strong>BudBot-IA WhatsApp Connector</strong></p>
                    <p>A página será atualizada automaticamente quando conectado.</p>
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
        <div style="text-align: center; padding: 50px; font-family: Arial; background: linear-gradient(135deg, #28a745, #20c997); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; color: #333; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                <h1 style="color: #28a745; margin-bottom: 20px;">✅ WhatsApp Conectado!</h1>
                <p style="font-size: 1.2em; margin-bottom: 30px;">O connector está funcionando corretamente.</p>
                <a href="/health" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold;">Ver Status Detalhado</a>
            </div>
        </div>`);
    } else {
        res.send(`
        <div style="text-align: center; padding: 50px; font-family: Arial; background: linear-gradient(135deg, #ffc107, #fd7e14); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; color: #333; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                <h1 style="color: #ffc107;">⏳ Inicializando...</h1>
                <p style="font-size: 1.2em;">O sistema está carregando. Aguarde alguns segundos.</p>
                <p>Tentativa: ${initializationAttempts}/${MAX_INIT_ATTEMPTS}</p>
                <div style="margin: 20px 0;">
                    <div style="width: 50px; height: 50px; border: 4px solid #f3f3f3; border-top: 4px solid #ffc107; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                </div>
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
                error: 'WhatsApp não está conectado',
                status: 'disconnected'
            });
        }

        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone e message são obrigatórios'
            });
        }

        // Formatar número
        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        
        // Enviar mensagem
        await client.sendMessage(chatId, message);

        console.log(`📤 Mensagem enviada para ${phone}: ${message}`);

        res.json({
            success: true,
            message: 'Mensagem enviada com sucesso',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao enviar mensagem'
        });
    }
});

app.get('/contact/:phone', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp não está conectado'
            });
        }

        const phone = req.params.phone;
        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        
        const contact = await client.getContactById(chatId);

        res.json({
            success: true,
            contact: {
                phone: phone,
                name: contact.pushname || contact.name,
                is_business: contact.isBusiness,
                profile_pic_url: await contact.getProfilePicUrl() || null
            }
        });

    } catch (error) {
        res.status(404).json({
            success: false,
            error: 'Contato não encontrado'
        });
    }
});

// Rota para reiniciar o WhatsApp
app.post('/restart', async (req, res) => {
    try {
        console.log('🔄 Reiniciando WhatsApp Connector...');
        
        if (client) {
            await client.destroy();
        }
        
        isReady = false;
        qrCodeData = null;
        initializationAttempts = 0;
        
        setTimeout(() => {
            initializeWhatsApp();
        }, 2000);
        
        res.json({
            success: true,
            message: 'WhatsApp Connector reiniciado'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Erro ao reiniciar'
        });
    }
});

// Rota raiz
app.get('/', (req, res) => {
    res.json({
        service: 'BudBot WhatsApp Connector',
        version: '1.0.0',
        status: isReady ? 'connected' : 'disconnected',
        initialization_attempts: initializationAttempts,
        uptime: process.uptime(),
        endpoints: {
            health: '/health',
            status: '/status',
            qr: '/qr',
            send: 'POST /send',
            contact: '/contact/:phone',
            restart: 'POST /restart'
        }
    });
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
    console.error('❌ Erro na API:', error);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
    });
});

// Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    console.log(`📡 BudBot API URL: ${BUDBOT_API_URL}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
    console.log(`📱 QR Code: http://localhost:${PORT}/qr`);
    
    // Aguardar um pouco antes de inicializar WhatsApp
    setTimeout(() => {
        initializeWhatsApp();
    }, 5000);
});

// Tratamento de sinais
process.on('SIGINT', async () => {
    console.log('🛑 Encerrando WhatsApp Connector...');
    if (client) {
        await client.destroy();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Encerrando WhatsApp Connector...');
    if (client) {
        await client.destroy();
    }
    process.exit(0);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});