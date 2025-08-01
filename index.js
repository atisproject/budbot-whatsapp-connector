#!/usr/bin/env node
/**
 * BudBot-IA WhatsApp Connector
 * Sistema Node.js para conectar com WhatsApp Web
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

// Configurações
const PORT = process.env.PORT || 10000;
const BUDBOT_API_URL = process.env.BUDBOT_API_URL || 'https://budbot-ia.onrender.com';
const API_SECRET = process.env.API_SECRET || 'budbot-secret-key';

// Inicializar Express
const app = express();
app.use(cors());
app.use(express.json());

// Cliente WhatsApp com configuração otimizada
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "budbot-session"
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    }
});

// Estado da conexão
let isReady = false;
let qrCodeData = null;

console.log('🚀 Iniciando BudBot-IA WhatsApp Connector...');

// Eventos do cliente WhatsApp
client.on('qr', (qr) => {
    console.log('📱 QR Code gerado! Escaneie com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
});

client.on('ready', () => {
    console.log('✅ WhatsApp conectado com sucesso!');
    isReady = true;
    qrCodeData = null;
});

client.on('authenticated', () => {
    console.log('🔐 WhatsApp autenticado!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação WhatsApp:', msg);
});

client.on('disconnected', (reason) => {
    console.log('📴 WhatsApp desconectado:', reason);
    isReady = false;
});

// Receber mensagens
client.on('message', async (message) => {
    try {
        // Ignorar mensagens próprias e de grupos
        if (message.fromMe || message.from.includes('@g.us')) {
            return;
        }

        console.log('📨 Nova mensagem:', {
            from: message.from,
            body: message.body,
            timestamp: new Date()
        });

        // Extrair número do telefone
        const phoneNumber = message.from.replace('@c.us', '');
        
        // Preparar dados para enviar ao BudBot-IA
        const messageData = {
            phone: phoneNumber,
            message: message.body,
            whatsapp_message_id: message.id.id,
            contact_name: message._data.notifyName || phoneNumber,
            timestamp: new Date().toISOString()
        };

        // Enviar para o sistema principal
        const response = await sendToBudBot('/api/whatsapp/receive', messageData);
        
        if (response && response.auto_reply) {
            // Enviar resposta automática
            await client.sendMessage(message.from, response.reply_message);
            console.log('🤖 Resposta automática enviada:', response.reply_message);
        }

    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
    }
});

// Função para enviar dados ao BudBot-IA
async function sendToBudBot(endpoint, data) {
    try {
        const response = await axios.post(`${BUDBOT_API_URL}${endpoint}`, data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_SECRET}`,
                'X-WhatsApp-Connector': 'true'
            },
            timeout: 10000
        });
        
        return response.data;
    } catch (error) {
        console.error('❌ Erro ao comunicar com BudBot-IA:', error.message);
        return null;
    }
}

// Rotas da API REST
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        whatsapp_connected: isReady,
        qr_code_available: !!qrCodeData,
        timestamp: new Date().toISOString()
    });
});

app.get('/qr', (req, res) => {
    if (qrCodeData) {
        res.json({
            success: true,
            qr_code: qrCodeData,
            message: 'Escaneie o QR Code com seu WhatsApp'
        });
    } else if (isReady) {
        res.json({
            success: false,
            message: 'WhatsApp já está conectado'
        });
    } else {
        res.json({
            success: false,
            message: 'QR Code não disponível no momento'
        });
    }
});

// Enviar mensagem via API
app.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!isReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp não está conectado'
            });
        }

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Telefone e mensagem são obrigatórios'
            });
        }

        // Formatar número para WhatsApp
        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        
        // Enviar mensagem
        await client.sendMessage(chatId, message);
        
        console.log('📤 Mensagem enviada para:', phone);
        
        res.json({
            success: true,
            message: 'Mensagem enviada com sucesso'
        });

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor'
        });
    }
});

// Obter informações do contato
app.get('/contact/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        
        if (!isReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp não está conectado'
            });
        }

        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        const contact = await client.getContactById(chatId);
        
        res.json({
            success: true,
            contact: {
                name: contact.name || contact.pushname || phone,
                phone: phone,
                is_business: contact.isBusiness || false,
                profile_pic: contact.profilePicThumbObj?.eurl || null
            }
        });

    } catch (error) {
        console.error('❌ Erro ao obter contato:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao obter informações do contato'
        });
    }
});

// Middleware de autenticação para rotas protegidas
app.use('/api/*', (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Token de autorização necessário'
        });
    }
    
    const token = authHeader.substring(7);
    if (token !== API_SECRET) {
        return res.status(403).json({
            success: false,
            error: 'Token inválido'
        });
    }
    
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        whatsapp_status: isReady ? 'connected' : 'disconnected'
    });
});

// Inicializar servidor
app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
    console.log(`📱 QR Code: http://localhost:${PORT}/qr`);
});

// Inicializar cliente WhatsApp
client.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Encerrando aplicação...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Encerrando aplicação...');
    await client.destroy();
    process.exit(0);
});