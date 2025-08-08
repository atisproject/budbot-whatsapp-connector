const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const winston = require('winston');

// Environment variables
const PORT = process.env.PORT || 5000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://www.agentbot-ia.shop';
const SESSION_PATH = process.env.SESSION_PATH || './wweb_session';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 5;

// Global variables
let whatsappClient = null;
let clientReady = false;
let qrCodeGenerated = false;
let lastQrCode = null;
let retryCount = 0;

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'connector.log' })
    ]
});

// Express app
const app = express();
app.use(express.json());

// Clean session locks function
function cleanSessionLocks() {
    try {
        const lockPath = path.join(SESSION_PATH, 'session-budbot-session', 'SingletonLock');
        if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
            logger.info('🗑️ Removed SingletonLock file');
        }
        
        // Clean Chrome user data dirs
        const tmpDir = '/tmp';
        if (fs.existsSync(tmpDir)) {
            const chromeUserDirs = fs.readdirSync(tmpDir).filter(dir => dir.startsWith('chrome-user-data-'));
            chromeUserDirs.forEach(dir => {
                try {
                    fs.rmSync(path.join(tmpDir, dir), { recursive: true, force: true });
                    logger.info(`🗑️ Removed Chrome user data dir: ${dir}`);
                } catch (err) {
                    logger.warn(`Warning cleaning ${dir}: ${err.message}`);
                }
            });
        }
    } catch (error) {
        logger.warn(`Lock cleanup warning: ${error.message}`);
    }
}

// Initialize WhatsApp with proper session handling
async function initializeWhatsApp() {
    logger.info('🚀 Initializing WhatsApp Connector...');
    
    // Clean any existing sessions first
    cleanSessionLocks();
    
    if (whatsappClient) {
        try {
            await whatsappClient.destroy();
            logger.info('✅ Previous client destroyed');
        } catch (err) {
            logger.warn(`Cleanup warning: ${err.message}`);
        }
        whatsappClient = null;
    }
    
    // Reset state
    clientReady = false;
    qrCodeGenerated = false;
    lastQrCode = null;
    
    // Create client with unique session and user data dir
    const timestamp = Date.now();
    const clientOptions = {
        authStrategy: new LocalAuth({
            clientId: `budbot-${timestamp}`,
            dataPath: SESSION_PATH
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-web-security',
                `--user-data-dir=/tmp/chrome-user-data-${timestamp}`
            ]
        }
    };
    
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        clientOptions.puppeteer.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        logger.info(`🔧 Using Chrome: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    }
    
    logger.info('🔧 Creating WhatsApp client...');
    whatsappClient = new Client(clientOptions);
    
    // QR Code event
    whatsappClient.on('qr', (qr) => {
        logger.info('📱 QR Code generated successfully!');
        qrCodeGenerated = true;
        lastQrCode = qr;
        
        console.log('\n📲 Scan this QR code with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n📱 Open WhatsApp > Menu > Linked devices > Link a device\n');
    });
    
    // Client ready event
    whatsappClient.on('ready', () => {
        logger.info('✅ WhatsApp client ready!');
        clientReady = true;
        qrCodeGenerated = false;
        retryCount = 0;
    });
    
    // Error handling
    whatsappClient.on('auth_failure', (msg) => {
        logger.error(`❌ Authentication failed: ${msg}`);
    });
    
    // Initialize
    try {
        logger.info('⚡ Starting WhatsApp client...');
        await whatsappClient.initialize();
        logger.info('✅ Client initialization completed');
    } catch (error) {
        logger.error(`❌ Initialization failed: ${error.message}`);
        
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            logger.info(`🔄 Retry ${retryCount}/${MAX_RETRIES} in 5 seconds...`);
            setTimeout(() => initializeWhatsApp(), 5000);
        }
    }
}

// Routes
app.get('/', (req, res) => {
    res.send(`
        <h1>🤖 BudBot WhatsApp Connector v5.0</h1>
        <p>Status: ${clientReady ? '✅ Connected' : '🔄 Connecting...'}</p>
        <p><a href="/qr">📱 View QR Code</a></p>
        <p><a href="/status">📊 View Status</a></p>
    `);
});

app.get('/qr', (req, res) => {
    if (qrCodeGenerated && lastQrCode) {
        res.send(`
            <h1>📱 WhatsApp QR Code</h1>
            <div id="qrcode"></div>
            <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
            <script>
                QRCode.toCanvas(document.getElementById('qrcode'), '${lastQrCode}', {width: 400});
            </script>
            <p>Scan with WhatsApp: Menu > Linked devices > Link a device</p>
        `);
    } else {
        res.send(`
            <h1>🔄 Generating QR Code...</h1>
            <p>Please wait while we generate the QR code...</p>
            <script>setTimeout(() => location.reload(), 3000);</script>
        `);
    }
});

app.get('/status', (req, res) => {
    res.json({
        connector_version: '5.0.0',
        client_ready: clientReady,
        qr_generated: qrCodeGenerated,
        qr_code: lastQrCode,
        backend_url: BACKEND_URL,
        session_path: SESSION_PATH,
        retry_count: retryCount,
        max_retries: MAX_RETRIES
    });
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    logger.info(`🌐 WhatsApp Connector v5.0 running on port ${PORT}`);
    logger.info(`🔗 Backend: ${BACKEND_URL}`);
    
    // Start WhatsApp initialization
    await initializeWhatsApp();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('🛑 Shutting down gracefully...');
    if (whatsappClient) {
        try {
            await whatsappClient.destroy();
        } catch (err) {
            logger.warn(`Shutdown cleanup: ${err.message}`);
        }
    }
    process.exit(0);
});