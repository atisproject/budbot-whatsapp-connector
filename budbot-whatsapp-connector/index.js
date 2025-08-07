/**
 * BudBot WhatsApp Connector v4.3.2
 * Sistema inteligente de atendimento WhatsApp com integração IA
 * Otimizado para Render.com deployment
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const winston = require('winston');
require('dotenv').config();

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

// Configuração de logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'whatsapp-connector.log' })
    ]
});

// Configurações
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://budbot-ia.onrender.com';
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || 'budbot_webhook_secret_2025';

// Express app setup
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Estado global da aplicação
let whatsappClient = null;
let clientStatus = 'disconnected';
let lastQRCode = null;
let connectedSessions = new Map();

/**
 * Configuração otimizada do cliente WhatsApp para Render.com
 */
function createWhatsAppClient() {
    logger.info('🔄 Inicializando cliente WhatsApp...');
    
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'budbot-session',
            dataPath: process.env.WWEB_SESSION_PATH || './wweb_session'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--memory-pressure-off',
                '--max_old_space_size=4096'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        }
    });

    // Event handlers
    client.on('qr', (qr) => {
        logger.info('📱 QR Code recebido');
        lastQRCode = qr;
        clientStatus = 'qr_ready';
        
        // Exibir QR no console
        qrcode.generate(qr, { small: true }, (qrString) => {
            console.log('\n🔍 Escaneie o QR Code abaixo com seu WhatsApp:\n');
            console.log(qrString);
            console.log('\n📲 Abra WhatsApp > Menu (3 pontos) > Dispositivos conectados > Conectar dispositivo\n');
        });

        // Notificar backend
        notifyBackend('qr_generated', { qr_code: qr });
    });

    client.on('ready', () => {
        logger.info('✅ WhatsApp Client conectado com sucesso!');
        clientStatus = 'connected';
        lastQRCode = null;
        
        const sessionInfo = {
            phone: client.info?.wid?.user || 'unknown',
            name: client.info?.pushname || 'WhatsApp User',
            platform: client.info?.platform || 'unknown'
        };
        
        connectedSessions.set('main', sessionInfo);
        notifyBackend('client_ready', sessionInfo);
    });

    client.on('authenticated', () => {
        logger.info('🔐 Autenticação realizada com sucesso');
        clientStatus = 'authenticated';
        notifyBackend('authenticated', {});
    });

    client.on('auth_failure', (msg) => {
        logger.error('❌ Falha na autenticação:', msg);
        clientStatus = 'auth_failure';
        notifyBackend('auth_failure', { error: msg });
    });

    client.on('disconnected', (reason) => {
        logger.warn('🔌 Cliente desconectado:', reason);
        clientStatus = 'disconnected';
        lastQRCode = null;
        connectedSessions.clear();
        notifyBackend('disconnected', { reason });
    });

    client.on('message', async (message) => {
        try {
            await handleIncomingMessage(message);
        } catch (error) {
            logger.error('❌ Erro ao processar mensagem:', error);
        }
    });

    return client;
}

/**
 * Processa mensagens recebidas
 */
async function handleIncomingMessage(message) {
    if (message.fromMe) return; // Ignora mensagens enviadas por nós
    
    const contact = await message.getContact();
    const chat = await message.getChat();
    
    const messageData = {
        id: message.id.id,
        from: message.from,
        to: message.to,
        body: message.body,
        timestamp: message.timestamp,
        type: message.type,
        contact: {
            number: contact.number,
            name: contact.name || contact.pushname || 'Usuário',
            isGroup: chat.isGroup,
            groupName: chat.isGroup ? chat.name : null
        },
        hasMedia: message.hasMedia,
        isForwarded: message.isForwarded,
        isStatus: message.isStatus
    };

    logger.info(`📨 Nova mensagem de ${messageData.contact.name} (${messageData.contact.number}): ${message.body}`);

    // Enviar para backend processar
    await notifyBackend('message_received', messageData);
}

/**
 * Notifica o backend sobre eventos
 */
async function notifyBackend(event, data) {
    try {
        const payload = {
            event: event,
            timestamp: new Date().toISOString(),
            data: data,
            session_id: 'main',
            token: WEBHOOK_TOKEN
        };

        const response = await axios.post(`${BACKEND_URL}/api/whatsapp/connector`, payload, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WEBHOOK_TOKEN}`
            }
        });

        logger.info(`📡 Evento '${event}' enviado para backend:`, response.status);
    } catch (error) {
        logger.error('❌ Erro ao notificar backend:', error.message);
    }
}

/**
 * API Routes
 */

// Status e saúde do serviço
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        whatsapp_status: clientStatus
    });
});

// Status do WhatsApp
app.get('/status', (req, res) => {
    res.json({
        status: clientStatus,
        qr_code: lastQRCode,
        sessions: Array.from(connectedSessions.entries()),
        timestamp: new Date().toISOString()
    });
});

// QR Code para conexão
app.get('/qr', (req, res) => {
    if (lastQRCode) {
        res.json({
            success: true,
            qr_code: lastQRCode,
            status: clientStatus
        });
    } else {
        res.json({
            success: false,
            message: 'QR Code não disponível',
            status: clientStatus
        });
    }
});

// Reinicializar cliente
app.post('/restart', async (req, res) => {
    try {
        logger.info('🔄 Reinicializando cliente WhatsApp...');
        
        if (whatsappClient) {
            await whatsappClient.destroy();
        }
        
        clientStatus = 'restarting';
        whatsappClient = createWhatsAppClient();
        await whatsappClient.initialize();
        
        res.json({
            success: true,
            message: 'Cliente reinicializado com sucesso',
            status: clientStatus
        });
    } catch (error) {
        logger.error('❌ Erro ao reinicializar:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao reinicializar cliente',
            error: error.message
        });
    }
});

// Enviar mensagem
app.post('/send-message', async (req, res) => {
    try {
        const { to, message, type = 'text' } = req.body;
        
        if (!whatsappClient || clientStatus !== 'connected') {
            return res.status(400).json({
                success: false,
                message: 'Cliente WhatsApp não conectado'
            });
        }

        const formattedNumber = to.includes('@c.us') ? to : `${to}@c.us`;
        
        let sentMessage;
        if (type === 'text') {
            sentMessage = await whatsappClient.sendMessage(formattedNumber, message);
        }
        
        logger.info(`📤 Mensagem enviada para ${to}: ${message}`);
        
        res.json({
            success: true,
            message_id: sentMessage.id.id,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('❌ Erro ao enviar mensagem:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao enviar mensagem',
            error: error.message
        });
    }
});

// Middleware de erro
app.use((error, req, res, next) => {
    logger.error('❌ Erro não tratado:', error);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
});

// Inicialização da aplicação
async function startApplication() {
    try {
        logger.info('🚀 Iniciando BudBot WhatsApp Connector v4.3.2...');
        
        // Inicializar cliente WhatsApp
        whatsappClient = createWhatsAppClient();
        await whatsappClient.initialize();
        
        // Iniciar servidor Express
        app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🌐 Servidor rodando na porta ${PORT}`);
            logger.info(`📡 Backend URL: ${BACKEND_URL}`);
            logger.info('✅ WhatsApp Connector iniciado com sucesso!');
        });
        
    } catch (error) {
        logger.error('❌ Erro ao inicializar aplicação:', error);
        process.exit(1);
    }
}

// Gerenciamento de sinais do processo
process.on('SIGINT', async () => {
    logger.info('🛑 Recebido SIGINT, encerrando aplicação...');
    if (whatsappClient) {
        await whatsappClient.destroy();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('🛑 Recebido SIGTERM, encerrando aplicação...');
    if (whatsappClient) {
        await whatsappClient.destroy();
    }
    process.exit(0);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Iniciar aplicação
startApplication();