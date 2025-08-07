/**
 * BudBot WhatsApp Connector v4.4.0
 * Render.com Optimized Version
 * Connects WhatsApp Web to BudBot-IA Backend
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const winston = require('winston');
require('dotenv').config();

// Environment variables
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://budbot-ia.onrender.com';
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || 'budbot_webhook_secret_2025';
const SESSION_PATH = process.env.WWEB_SESSION_PATH || './wweb_session';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Configure Winston Logger
const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}] ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'whatsapp-connector.log' })
    ]
});

// Express app for health checks
const app = express();
app.use(express.json());

let whatsappClient = null;
let clientReady = false;
let qrCodeGenerated = false;

// Health check endpoint
app.get('/health', (req, res) => {
    const status = {
        status: 'ok',
        message: 'WhatsApp Connector is running',
        client_ready: clientReady,
        qr_generated: qrCodeGenerated,
        timestamp: new Date().toISOString()
    };
    res.json(status);
});

// Status endpoint
app.get('/status', (req, res) => {
    res.json({
        connector_version: '4.4.0',
        client_ready: clientReady,
        qr_generated: qrCodeGenerated,
        backend_url: BACKEND_URL,
        session_path: SESSION_PATH
    });
});

/**
 * Notify backend about events
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

        logger.info(`📡 Notifying backend: ${event}`);
        
        const response = await axios.post(`${BACKEND_URL}/api/whatsapp/connector`, payload, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WEBHOOK_TOKEN}`
            }
        });

        logger.info(`✅ Backend notified successfully: ${response.status}`);
        return response.data;
    } catch (error) {
        logger.error(`❌ Failed to notify backend: ${error.message}`);
        if (error.response) {
            logger.error(`Response: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

/**
 * Initialize WhatsApp Client
 */
function initializeWhatsApp() {
    logger.info('🚀 Initializing WhatsApp Web Client v4.4.0...');

    const clientOptions = {
        authStrategy: new LocalAuth({
            clientId: 'budbot-session',
            dataPath: SESSION_PATH
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
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        }
    };

    // Add Puppeteer executable path for Render.com
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        clientOptions.puppeteer.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        logger.info(`🔧 Using Puppeteer executable: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    }

    whatsappClient = new Client(clientOptions);

    // QR Code generation
    whatsappClient.on('qr', async (qr) => {
        logger.info('📱 QR Code generated');
        qrCodeGenerated = true;
        
        // Display QR code in terminal
        qrcode.generate(qr, { small: true });
        
        // Notify backend
        try {
            await notifyBackend('qr_generated', {
                qr_code: qr,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error(`Failed to notify backend about QR: ${error.message}`);
        }
    });

    // Client ready
    whatsappClient.on('ready', async () => {
        logger.info('✅ WhatsApp Web Client is ready!');
        clientReady = true;
        
        try {
            await notifyBackend('client_ready', {
                timestamp: Date.now(),
                session_id: 'main'
            });
        } catch (error) {
            logger.error(`Failed to notify backend about ready state: ${error.message}`);
        }
    });

    // Authentication success
    whatsappClient.on('authenticated', async () => {
        logger.info('🔐 WhatsApp authenticated successfully');
        
        try {
            await notifyBackend('authenticated', {
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error(`Failed to notify backend about authentication: ${error.message}`);
        }
    });

    // Message received
    whatsappClient.on('message_create', async (message) => {
        // Only process incoming messages (not sent by us)
        if (message.fromMe) return;

        try {
            const contact = await message.getContact();
            const chat = await message.getChat();
            
            logger.info(`📨 New message from ${contact.name || contact.number}: ${message.body.substring(0, 50)}...`);

            const messageData = {
                id: message.id._serialized,
                from: message.from,
                body: message.body,
                timestamp: message.timestamp,
                contact: {
                    name: contact.name || contact.pushname || 'Unknown',
                    number: contact.number
                },
                chat: {
                    name: chat.name,
                    isGroup: chat.isGroup
                }
            };

            await notifyBackend('message_received', messageData);
            
        } catch (error) {
            logger.error(`❌ Error processing message: ${error.message}`);
        }
    });

    // Disconnection
    whatsappClient.on('disconnected', async (reason) => {
        logger.warn(`⚠️ WhatsApp disconnected: ${reason}`);
        clientReady = false;
        qrCodeGenerated = false;
        
        try {
            await notifyBackend('disconnected', {
                reason: reason,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error(`Failed to notify backend about disconnection: ${error.message}`);
        }

        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
            logger.info('🔄 Attempting to reconnect...');
            initializeWhatsApp();
        }, 5000);
    });

    // Start the client
    whatsappClient.initialize();
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('🛑 Shutting down gracefully...');
    
    if (whatsappClient) {
        await whatsappClient.destroy();
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('🛑 SIGTERM received, shutting down...');
    
    if (whatsappClient) {
        await whatsappClient.destroy();
    }
    
    process.exit(0);
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🌐 Health check server running on port ${PORT}`);
    logger.info(`🔗 Backend URL: ${BACKEND_URL}`);
    
    // Initialize WhatsApp connection
    initializeWhatsApp();
});

logger.info('🚀 BudBot WhatsApp Connector v4.4.0 started');