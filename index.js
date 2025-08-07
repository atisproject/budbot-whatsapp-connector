/**
 * BudBot WhatsApp Connector v5.0
 * Complete Integration with Backend - Production Ready
 * 
 * Features:
 * - WhatsApp Web integration with whatsapp-web.js v1.31.0
 * - Real-time backend communication
 * - QR Code generation and display
 * - Message processing and lead creation
 * - Health checks and monitoring
 * - Memory optimization for Render.com
 * - Automatic reconnection and retry logic
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const winston = require('winston');
require('dotenv').config();

// Environment variables with defaults
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://budbot-ia.onrender.com';
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || 'budbot_webhook_secret_2025';
const SESSION_PATH = process.env.WWEB_SESSION_PATH || './wweb_session';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 5;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY) || 5000;

// Configure Winston Logger with structured logging
const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
            const logMessage = stack || message;
            return `${timestamp} [${level.toUpperCase()}] ${logMessage}`;
        })
    ),
    transports: [
        new winston.transports.Console({
            handleExceptions: true,
            humanReadableUnhandledException: true
        }),
        new winston.transports.File({ 
            filename: 'whatsapp-connector.log',
            handleExceptions: true,
            maxsize: 10485760, // 10MB
            maxFiles: 5
        })
    ],
    exitOnError: false
});

// Express app for health checks and monitoring
const app = express();
app.use(express.json());

// Global state management
let whatsappClient = null;
let clientReady = false;
let qrCodeGenerated = false;
let retryCount = 0;
let lastQrCode = null;
let connectionStats = {
    startTime: new Date(),
    totalMessages: 0,
    lastMessage: null,
    reconnections: 0
};

// Health check endpoint with detailed status
app.get('/health', (req, res) => {
    const uptime = Math.floor((new Date() - connectionStats.startTime) / 1000);
    const status = {
        status: 'ok',
        message: 'BudBot WhatsApp Connector v5.0 is running',
        client_ready: clientReady,
        qr_generated: qrCodeGenerated,
        backend_url: BACKEND_URL,
        uptime_seconds: uptime,
        stats: {
            total_messages: connectionStats.totalMessages,
            last_message: connectionStats.lastMessage,
            reconnections: connectionStats.reconnections
        },
        timestamp: new Date().toISOString(),
        version: '5.0.0'
    };
    
    res.json(status);
});

// Status endpoint with QR code
app.get('/status', (req, res) => {
    res.json({
        connector_version: '5.0.0',
        client_ready: clientReady,
        qr_generated: qrCodeGenerated,
        qr_code: qrCodeGenerated ? lastQrCode : null,
        backend_url: BACKEND_URL,
        session_path: SESSION_PATH,
        retry_count: retryCount,
        max_retries: MAX_RETRIES,
        connection_stats: connectionStats
    });
});

// QR Code endpoint for web display
app.get('/qr', (req, res) => {
    if (qrCodeGenerated && lastQrCode) {
        res.json({
            status: 'available',
            qr_code: lastQrCode,
            message: 'Scan this QR code with WhatsApp',
            instructions: 'Open WhatsApp > Menu (3 dots) > Linked devices > Link a device'
        });
    } else {
        res.json({
            status: 'unavailable',
            message: 'QR code not available. Client may be connected or initializing.',
            client_ready: clientReady
        });
    }
});

/**
 * Notify backend about events with retry logic
 */
async function notifyBackend(event, data, attempts = 1) {
    try {
        const payload = {
            event: event,
            timestamp: new Date().toISOString(),
            data: data,
            session_id: 'main',
            token: WEBHOOK_TOKEN,
            connector_version: '5.0.0'
        };

        logger.info(`📡 Notifying backend (attempt ${attempts}): ${event}`);
        
        const response = await axios.post(`${BACKEND_URL}/api/whatsapp/connector`, payload, {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WEBHOOK_TOKEN}`,
                'User-Agent': 'BudBot-WhatsApp-Connector/5.0.0'
            }
        });

        logger.info(`✅ Backend notified successfully: ${response.status} - ${event}`);
        return response.data;
        
    } catch (error) {
        logger.error(`❌ Failed to notify backend (attempt ${attempts}): ${error.message}`);
        
        if (error.response) {
            logger.error(`Response: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        
        // Retry logic for critical events
        if (attempts < 3 && ['message_received', 'client_ready'].includes(event)) {
            logger.info(`🔄 Retrying backend notification in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return notifyBackend(event, data, attempts + 1);
        }
        
        throw error;
    }
}

/**
 * Initialize WhatsApp Client with advanced configuration
 */
function initializeWhatsApp() {
    logger.info('🚀 Initializing BudBot WhatsApp Connector v5.0...');
    
    // Destroy existing client if any
    if (whatsappClient) {
        whatsappClient.destroy().catch(err => 
            logger.warn(`Warning during client cleanup: ${err.message}`)
        );
    }

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
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images'
            ]
        }
    };

    // Production Puppeteer configuration
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        clientOptions.puppeteer.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        logger.info(`🔧 Using Puppeteer executable: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    }

    whatsappClient = new Client(clientOptions);

    // QR Code generation
    whatsappClient.on('qr', async (qr) => {
        logger.info('📱 QR Code generated - ready for scanning');
        qrCodeGenerated = true;
        lastQrCode = qr;
        
        // Display QR code in terminal
        console.log('\n📲 Scan this QR code with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n📱 Instructions: Open WhatsApp > Menu (3 dots) > Linked devices > Link a device\n');
        
        // Notify backend
        try {
            await notifyBackend('qr_generated', {
                qr_code: qr,
                timestamp: Date.now(),
                instructions: 'Scan with WhatsApp mobile app'
            });
        } catch (error) {
            logger.error(`Failed to notify backend about QR: ${error.message}`);
        }
    });

    // Client ready
    whatsappClient.on('ready', async () => {
        logger.info('✅ WhatsApp Web Client connected and ready!');
        clientReady = true;
        qrCodeGenerated = false;
        lastQrCode = null;
        retryCount = 0;
        
        try {
            const clientInfo = whatsappClient.info;
            await notifyBackend('client_ready', {
                timestamp: Date.now(),
                session_id: 'main',
                client_info: {
                    wid: clientInfo?.wid?.user || 'unknown',
                    platform: clientInfo?.platform || 'web'
                }
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
                timestamp: Date.now(),
                session_restored: true
            });
        } catch (error) {
            logger.error(`Failed to notify backend about authentication: ${error.message}`);
        }
    });

    // Message received handler
    whatsappClient.on('message_create', async (message) => {
        // Only process incoming messages (not sent by us)
        if (message.fromMe) return;

        try {
            connectionStats.totalMessages++;
            connectionStats.lastMessage = new Date().toISOString();
            
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
                    number: contact.number,
                    is_contact: contact.isMyContact
                },
                chat: {
                    name: chat.name,
                    is_group: chat.isGroup,
                    id: chat.id._serialized
                },
                message_type: message.type || 'text'
            };

            await notifyBackend('message_received', messageData);
            
        } catch (error) {
            logger.error(`❌ Error processing message: ${error.message}`);
        }
    });

    // Disconnection handler
    whatsappClient.on('disconnected', async (reason) => {
        logger.warn(`⚠️ WhatsApp disconnected: ${reason}`);
        clientReady = false;
        qrCodeGenerated = false;
        lastQrCode = null;
        connectionStats.reconnections++;
        
        try {
            await notifyBackend('disconnected', {
                reason: reason,
                timestamp: Date.now(),
                retry_count: retryCount
            });
        } catch (error) {
            logger.error(`Failed to notify backend about disconnection: ${error.message}`);
        }

        // Automatic reconnection with exponential backoff
        if (retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY * Math.pow(2, retryCount);
            retryCount++;
            
            logger.info(`🔄 Attempting reconnection ${retryCount}/${MAX_RETRIES} in ${delay/1000} seconds...`);
            setTimeout(() => {
                initializeWhatsApp();
            }, delay);
        } else {
            logger.error(`❌ Max reconnection attempts (${MAX_RETRIES}) reached. Manual intervention required.`);
        }
    });

    // Error handler
    whatsappClient.on('auth_failure', (message) => {
        logger.error(`🔒 Authentication failed: ${message}`);
        qrCodeGenerated = false;
        clientReady = false;
    });

    // Loading screen handler
    whatsappClient.on('loading_screen', (percent, message) => {
        logger.info(`⏳ Loading: ${percent}% - ${message}`);
    });

    // Initialize the client
    whatsappClient.initialize();
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    logger.info('🛑 SIGINT received, shutting down gracefully...');
    await gracefulShutdown();
});

process.on('SIGTERM', async () => {
    logger.info('🛑 SIGTERM received, shutting down gracefully...');
    await gracefulShutdown();
});

async function gracefulShutdown() {
    try {
        if (whatsappClient) {
            logger.info('📱 Disconnecting WhatsApp client...');
            await whatsappClient.destroy();
        }
        
        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
    }
}

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start Express server and initialize WhatsApp
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🌐 BudBot WhatsApp Connector v5.0 server running on port ${PORT}`);
    logger.info(`🔗 Backend URL: ${BACKEND_URL}`);
    logger.info(`📁 Session path: ${SESSION_PATH}`);
    logger.info(`🔄 Max retries: ${MAX_RETRIES}`);
    
    // Initialize WhatsApp connection
    initializeWhatsApp();
});

logger.info('🚀 BudBot WhatsApp Connector v5.0 - Production Ready Edition started');

// Export for testing
module.exports = { app, initializeWhatsApp, notifyBackend };