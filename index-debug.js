const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const winston = require('winston');

// Environment variables
const PORT = process.env.PORT || 5000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://www.agentbot-ia.shop';
const SESSION_PATH = process.env.SESSION_PATH || './wweb_session';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 3;

// Global variables
let whatsappClient = null;
let clientReady = false;
let qrCodeGenerated = false;
let lastQrCode = null;
let retryCount = 0;
let initializationLogs = [];

// Logger configuration
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'connector.log' })
    ]
});

function addLog(message) {
    const logEntry = `${new Date().toISOString()} - ${message}`;
    initializationLogs.push(logEntry);
    logger.info(message);
    console.log(logEntry);
}

// Express app
const app = express();
app.use(express.json());

// Clean session locks function
function cleanSessionLocks() {
    try {
        addLog('🧹 Starting session cleanup...');
        
        // Remove session lock files
        const lockPaths = [
            path.join(SESSION_PATH, 'session-budbot-session', 'SingletonLock'),
            path.join(SESSION_PATH, 'SingletonLock')
        ];
        
        lockPaths.forEach(lockPath => {
            if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
                addLog(`🗑️ Removed lock file: ${lockPath}`);
            }
        });
        
        // Clean Chrome user data dirs
        const tmpDir = '/tmp';
        if (fs.existsSync(tmpDir)) {
            const chromeUserDirs = fs.readdirSync(tmpDir).filter(dir => dir.startsWith('chrome-user-data-'));
            chromeUserDirs.forEach(dir => {
                try {
                    const fullPath = path.join(tmpDir, dir);
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    addLog(`🗑️ Removed Chrome user data: ${dir}`);
                } catch (err) {
                    addLog(`⚠️ Warning cleaning ${dir}: ${err.message}`);
                }
            });
        }
        
        addLog('✅ Session cleanup completed');
    } catch (error) {
        addLog(`❌ Session cleanup error: ${error.message}`);
    }
}

// Initialize WhatsApp with detailed logging
async function initializeWhatsApp() {
    addLog('🚀 Starting WhatsApp initialization...');
    addLog(`📍 Current working directory: ${process.cwd()}`);
    addLog(`📂 Session path: ${SESSION_PATH}`);
    addLog(`🔧 Puppeteer executable: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'default'}`);
    
    // Clean sessions first
    cleanSessionLocks();
    
    // Destroy existing client
    if (whatsappClient) {
        try {
            addLog('🧹 Destroying existing client...');
            await whatsappClient.destroy();
            addLog('✅ Previous client destroyed');
        } catch (err) {
            addLog(`⚠️ Cleanup warning: ${err.message}`);
        }
        whatsappClient = null;
    }
    
    // Reset state
    clientReady = false;
    qrCodeGenerated = false;
    lastQrCode = null;
    
    // Create session directory
    try {
        if (!fs.existsSync(SESSION_PATH)) {
            fs.mkdirSync(SESSION_PATH, { recursive: true });
            addLog(`📁 Created session directory: ${SESSION_PATH}`);
        }
    } catch (error) {
        addLog(`❌ Error creating session directory: ${error.message}`);
    }
    
    // Client configuration
    const timestamp = Date.now();
    const userDataDir = `/tmp/chrome-user-data-${timestamp}`;
    
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
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                `--user-data-dir=${userDataDir}`
            ]
        }
    };
    
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        clientOptions.puppeteer.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        addLog(`🔧 Using Chrome executable: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    }
    
    addLog(`🎯 Client config: ${JSON.stringify(clientOptions, null, 2)}`);
    
    try {
        addLog('🔧 Creating WhatsApp client...');
        whatsappClient = new Client(clientOptions);
        addLog('✅ Client created successfully');
        
        // Setup event listeners
        whatsappClient.on('qr', (qr) => {
            addLog('📱 QR Code event triggered!');
            qrCodeGenerated = true;
            lastQrCode = qr;
            
            console.log('\n📲 Scan this QR code with WhatsApp:\n');
            qrcode.generate(qr, { small: true });
            console.log('\n📱 Open WhatsApp > Menu > Linked devices > Link a device\n');
            
            addLog('✅ QR Code generated and displayed');
        });
        
        whatsappClient.on('ready', () => {
            addLog('✅ WhatsApp client is ready!');
            clientReady = true;
            qrCodeGenerated = false;
            retryCount = 0;
        });
        
        whatsappClient.on('authenticated', () => {
            addLog('🔐 WhatsApp client authenticated');
        });
        
        whatsappClient.on('auth_failure', (msg) => {
            addLog(`❌ Authentication failed: ${msg}`);
        });
        
        whatsappClient.on('disconnected', (reason) => {
            addLog(`🔌 Client disconnected: ${reason}`);
        });
        
        // Initialize client
        addLog('⚡ Initializing WhatsApp client...');
        await whatsappClient.initialize();
        addLog('✅ Client initialization completed');
        
    } catch (error) {
        addLog(`❌ Initialization failed: ${error.message}`);
        addLog(`📋 Error stack: ${error.stack}`);
        
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            addLog(`🔄 Retry ${retryCount}/${MAX_RETRIES} in 10 seconds...`);
            setTimeout(() => initializeWhatsApp(), 10000);
        } else {
            addLog(`❌ Max retries (${MAX_RETRIES}) reached. Giving up.`);
        }
    }
}

// Routes
app.get('/', (req, res) => {
    res.send(`
        <h1>🤖 BudBot WhatsApp Connector v5.0 (Debug)</h1>
        <p>Status: ${clientReady ? '✅ Connected' : '🔄 Connecting...'}</p>
        <p>QR Generated: ${qrCodeGenerated ? '✅ Yes' : '❌ No'}</p>
        <p>Retry Count: ${retryCount}/${MAX_RETRIES}</p>
        <p><a href="/qr">📱 View QR Code</a></p>
        <p><a href="/status">📊 View Status</a></p>
        <p><a href="/logs">📋 View Logs</a></p>
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
            <p><a href="/">🏠 Back to Home</a></p>
        `);
    } else {
        res.send(`
            <h1>🔄 Generating QR Code...</h1>
            <p>Status: ${clientReady ? 'Connected' : 'Connecting...'}</p>
            <p>QR Generated: ${qrCodeGenerated ? 'Yes' : 'No'}</p>
            <p>Retry: ${retryCount}/${MAX_RETRIES}</p>
            <p>Please wait while we generate the QR code...</p>
            <p><a href="/logs">📋 View Debug Logs</a></p>
            <script>setTimeout(() => location.reload(), 5000);</script>
        `);
    }
});

app.get('/status', (req, res) => {
    res.json({
        connector_version: '5.0.0-debug',
        client_ready: clientReady,
        qr_generated: qrCodeGenerated,
        qr_code: lastQrCode,
        backend_url: BACKEND_URL,
        session_path: SESSION_PATH,
        retry_count: retryCount,
        max_retries: MAX_RETRIES,
        puppeteer_path: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        cwd: process.cwd(),
        logs_count: initializationLogs.length
    });
});

app.get('/logs', (req, res) => {
    const logsHtml = initializationLogs.map(log => `<p>${log}</p>`).join('\n');
    res.send(`
        <h1>📋 Debug Logs</h1>
        <div style="font-family: monospace; font-size: 12px; background: #f0f0f0; padding: 10px;">
            ${logsHtml}
        </div>
        <p><a href="/">🏠 Back to Home</a></p>
        <script>setTimeout(() => location.reload(), 10000);</script>
    `);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    addLog(`🌐 WhatsApp Connector v5.0 (Debug) running on port ${PORT}`);
    addLog(`🔗 Backend: ${BACKEND_URL}`);
    addLog(`📂 Working directory: ${process.cwd()}`);
    addLog(`👤 User: ${process.getuid ? process.getuid() : 'unknown'}`);
    
    // Start WhatsApp initialization
    setTimeout(() => initializeWhatsApp(), 2000);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    addLog('🛑 Shutting down gracefully...');
    if (whatsappClient) {
        try {
            await whatsappClient.destroy();
        } catch (err) {
            addLog(`Shutdown cleanup: ${err.message}`);
        }
    }
    process.exit(0);
});

// Error handlers
process.on('uncaughtException', (error) => {
    addLog(`❌ Uncaught Exception: ${error.message}`);
    addLog(`📋 Stack: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
    addLog(`❌ Unhandled Rejection: ${reason}`);
    addLog(`📋 Promise: ${promise}`);
});