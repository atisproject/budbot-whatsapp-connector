const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');

// Environment variables
const PORT = process.env.PORT || 5000;

// Global variables
let whatsappClient = null;
let qrCodeGenerated = false;
let lastQrCode = null;

// Express app
const app = express();

console.log('🚀 Starting BudBot WhatsApp Connector (SIMPLE VERSION)...');

// Initialize WhatsApp immediately
async function initWhatsApp() {
    try {
        console.log('⚡ Creating WhatsApp client...');
        console.log('🔧 Chrome path: /usr/bin/chromium');
        
        // Test if Chrome exists
        const fs = require('fs');
        if (!fs.existsSync('/usr/bin/chromium')) {
            console.log('❌ Chrome not found at /usr/bin/chromium');
            return;
        }
        console.log('✅ Chrome found');
        
        whatsappClient = new Client({
            authStrategy: new LocalAuth({
                clientId: 'budbot-render',
                dataPath: './wweb_session'
            }),
            puppeteer: {
                headless: true,
                executablePath: '/usr/bin/chromium',
                timeout: 60000,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-web-security',
                    '--no-first-run',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--memory-pressure-off',
                    '--max_old_space_size=512',
                    '--disable-crash-reporter',
                    '--no-default-browser-check',
                    '--disable-notifications',
                    '--user-data-dir=/tmp/chrome-user-data'
                ]
            }
        });

        whatsappClient.on('loading_screen', (percent, message) => {
            console.log(`🔄 Loading: ${percent}% - ${message}`);
        });

        whatsappClient.on('qr', (qr) => {
            console.log('📱 QR Code generated!');
            qrCodeGenerated = true;
            lastQrCode = qr;
            
            console.log('\n=== SCAN THIS QR CODE ===\n');
            qrcode.generate(qr, { small: true });
            console.log('\n========================\n');
        });

        whatsappClient.on('ready', () => {
            console.log('✅ WhatsApp ready!');
        });

        whatsappClient.on('auth_failure', (msg) => {
            console.log('❌ Auth failed:', msg);
        });

        whatsappClient.on('disconnected', (reason) => {
            console.log(`🔌 Disconnected: ${reason}`);
        });

        console.log('🔄 Initializing WhatsApp client...');
        
        // Add timeout for initialization
        const initPromise = whatsappClient.initialize();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Initialization timeout after 120 seconds')), 120000)
        );
        
        await Promise.race([initPromise, timeoutPromise]);
        console.log('✅ Initialization completed');
        
    } catch (error) {
        console.log('❌ Fatal error:', error.message);
        console.log('📋 Stack:', error.stack);
        
        // Try simple Puppeteer test
        console.log('🧪 Testing Puppeteer directly...');
        const puppeteer = require('puppeteer');
        try {
            const browser = await puppeteer.launch({
                headless: true,
                executablePath: '/usr/bin/chromium',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.log('✅ Puppeteer can launch Chrome');
            await browser.close();
        } catch (puppeteerError) {
            console.log('❌ Puppeteer test failed:', puppeteerError.message);
        }
    }
}

// Routes
app.get('/', (req, res) => {
    res.send(`
        <h1>🤖 WhatsApp Connector (Simple)</h1>
        <p>QR Generated: ${qrCodeGenerated ? 'YES' : 'NO'}</p>
        <p><a href="/qr">View QR Code</a></p>
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
        `);
    } else {
        res.send(`
            <h1>🔄 No QR Code Yet</h1>
            <p>Waiting for QR code generation...</p>
            <script>setTimeout(() => location.reload(), 3000);</script>
        `);
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server running on port ${PORT}`);
    
    // Start WhatsApp after 3 seconds
    setTimeout(initWhatsApp, 3000);
});