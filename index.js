#!/usr/bin/env node
/**
 * BudBot WhatsApp Connector
 * Conecta WhatsApp Web ao sistema BudBot-IA
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

// Inicializar cliente WhatsApp
function initializeWhatsApp() {
    console.log('🚀 Iniciando WhatsApp Connector...');
    
    client = new Client({
        authStrategy: new LocalAuth({
            name: 'budbot-session'
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
                '--single-process',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        }
    });

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
    });

    // Evento: Erro de autenticação
    client.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação:', msg);
        isReady = false;
    });

    // Inicializar cliente
    client.initialize().catch(error => {
        console.error('❌ Erro ao inicializar WhatsApp:', error);
    });
}

// Rotas da API
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        whatsapp_ready: isReady,
        has_qr: qrCodeData !== null,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
        config: {
            budbot_url: BUDBOT_API_URL,
            node_env: process.env.NODE_ENV
        }
    });
});

app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        has_qr: qrCodeData !== null,
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
            <title>WhatsApp QR Code</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f5f5f5; }
                .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .qr-container { margin: 20px auto; }
                img { max-width: 100%; border: 1px solid #ddd; border-radius: 8px; }
                .status { color: #28a745; font-weight: bold; }
                .instructions { color: #666; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📱 WhatsApp QR Code</h1>
                <div class="status">🔗 Conectando...</div>
                <div class="instructions">
                    <p>1. Abra o WhatsApp no seu celular</p>
                    <p>2. Vá em Menu → Dispositivos conectados</p>
                    <p>3. Escaneie o QR Code abaixo</p>
                </div>
                <div class="qr-container">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}" alt="QR Code"/>
                </div>
                <p><small>A página será atualizada automaticamente quando conectado.</small></p>
            </div>
            <script>
                setTimeout(() => location.reload(), 10000);
            </script>
        </body>
        </html>`;
        res.send(html);
    } else if (isReady) {
        res.send(`
        <div style="text-align: center; padding: 50px; font-family: Arial;">
            <h1 style="color: #28a745;">✅ WhatsApp Conectado!</h1>
            <p>O connector está funcionando corretamente.</p>
            <a href="/health" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ver Status Detalhado</a>
        </div>`);
    } else {
        res.send(`
        <div style="text-align: center; padding: 50px; font-family: Arial;">
            <h1>⏳ Aguardando QR Code...</h1>
            <p>O sistema está inicializando. Aguarde alguns segundos.</p>
            <script>setTimeout(() => location.reload(), 5000);</script>
        </div>`);
    }
});

app.post('/send', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp não está conectado'
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
            message: 'Mensagem enviada com sucesso'
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

// Rota raiz
app.get('/', (req, res) => {
    res.json({
        service: 'BudBot WhatsApp Connector',
        version: '1.0.0',
        status: isReady ? 'connected' : 'disconnected',
        endpoints: {
            health: '/health',
            status: '/status',
            qr: '/qr',
            send: 'POST /send',
            contact: '/contact/:phone'
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
    }, 2000);
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