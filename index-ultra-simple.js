const { Client, NoAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 5000;

let qrCodeData = null;
let clientStatus = 'starting';

console.log('🚀 Ultra Simple WhatsApp Connector');

// Minimal client setup
const client = new Client({
    authStrategy: new NoAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    }
});

client.on('qr', qr => {
    console.log('📱 QR RECEIVED!');
    qrCodeData = qr;
    clientStatus = 'qr_ready';
    
    qrcode.generate(qr, {small: true});
    console.log('QR Code printed to console');
});

client.on('ready', () => {
    console.log('✅ Client ready!');
    clientStatus = 'ready';
});

client.on('auth_failure', msg => {
    console.log('❌ Auth failure:', msg);
    clientStatus = 'auth_failed';
});

// Routes
app.get('/', (req, res) => {
    res.send(`
        <h1>Ultra Simple Connector</h1>
        <p>Status: ${clientStatus}</p>
        <p>QR: ${qrCodeData ? 'Available' : 'Waiting'}</p>
        <a href="/qr">View QR</a>
    `);
});

app.get('/qr', (req, res) => {
    if (qrCodeData) {
        res.send(`
            <h1>📱 QR Code Ready</h1>
            <div id="qr"></div>
            <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
            <script>
                QRCode.toCanvas(document.getElementById('qr'), '${qrCodeData}', {width: 300});
            </script>
            <p>Scan this with WhatsApp</p>
        `);
    } else {
        res.send('<h1>⏳ Generating QR...</h1><script>setTimeout(() => location.reload(), 2000);</script>');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on ${PORT}`);
    
    setTimeout(() => {
        console.log('Starting WhatsApp client...');
        client.initialize().catch(err => {
            console.log('Init error:', err.message);
        });
    }, 3000);
});