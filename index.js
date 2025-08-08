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
function initWhatsApp() {
    console.log('⚡ Creating WhatsApp client...');
    
    whatsappClient = new Client({
        authStrategy: new LocalAuth({
            clientId: 'budbot-simple'
        }),
        puppeteer: {
            headless: true,
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ]
        }
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

    console.log('🔄 Initializing...');
    whatsappClient.initialize().catch(error => {
        console.log('❌ Error:', error.message);
    });
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