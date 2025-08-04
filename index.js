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
                '--disable-gpu'
            ]
        }
    });

    // Evento: QR Code
    client.on('qr', (qr) => {
        console.log('📱 QR Code gerado! Escaneie com seu WhatsApp:');
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

            // Verificar se há resposta automática
            if (response.data.auto_reply && response.data.reply_message) {
                await message.reply(response.data.reply_message);
                console.log(`🤖 Resposta automática enviada para ${messageData.phone}`);
            }

        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error.message);
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
    client.initialize();
}

// Rotas da API
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        whatsapp_ready: isReady,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
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
        res.json({
            qr_code: qrCodeData,
            message: 'Escaneie o QR Code com seu WhatsApp'
        });
    } else if (isReady) {
        res.json({
            message: 'WhatsApp já está conectado'
        });
    } else {
        res.json({
            message: 'QR Code não disponível. Reinicie o serviço.'
        });
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
    initializeWhatsApp();
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