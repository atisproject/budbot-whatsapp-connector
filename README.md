# BudBot WhatsApp Connector v5.0

🚀 **Production Ready** - Complete integration with BudBot-IA backend system

## 🌟 What's New in v5.0

- ✅ **Complete Backend Integration** - Full communication with BudBot-IA API
- ✅ **Advanced Health Monitoring** - Comprehensive status endpoints
- ✅ **Retry Logic & Resilience** - Automatic reconnection with exponential backoff
- ✅ **Memory Optimization** - Optimized for Render.com deployment
- ✅ **Enhanced Logging** - Structured logging with Winston
- ✅ **QR Code Web Interface** - Access QR codes via HTTP endpoints
- ✅ **Production Security** - Non-root Docker container with proper permissions
- ✅ **Comprehensive Documentation** - Complete deployment guides

## 🏗️ Architecture

```
WhatsApp Web ←→ Connector (Node.js) ←→ BudBot-IA Backend (Flask)
                      ↓
                 PostgreSQL Database
```

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

### 2. Local Development

```bash
# Install dependencies
npm install

# Start connector
npm start
```

### 3. Deploy to Render.com

#### Method A: Node.js Native (Recommended)
- **Environment:** `Node`
- **Build Command:** `npm install --omit=dev --no-audit --no-fund`
- **Start Command:** `node index.js`

#### Method B: Docker
- Uses included `Dockerfile`
- Automatically configured for Render.com

## 📡 API Endpoints

### Health Check
```bash
GET /health
```
Returns comprehensive status including uptime, message counts, and connection state.

### Status with QR Code
```bash
GET /status
```
Returns detailed status including QR code if available.

### QR Code Access
```bash
GET /qr
```
Returns current QR code for web display.

## 🔧 Configuration

### Required Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND_URL` | BudBot-IA backend URL | `https://budbot-ia.onrender.com` |
| `WEBHOOK_TOKEN` | Security token for backend communication | `budbot_webhook_secret_2025` |
| `PORT` | Server port | `3000` |

### Optional Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` |
| `MAX_RETRIES` | Maximum reconnection attempts | `5` |
| `RETRY_DELAY` | Base retry delay in milliseconds | `5000` |
| `WWEB_SESSION_PATH` | WhatsApp session storage path | `./wweb_session` |

### Render.com Specific

| Variable | Description | Default |
|----------|-------------|---------|
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | Skip Chromium download | `true` |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium executable path | `/usr/bin/chromium` |

## 🔄 Event Flow

### 1. QR Code Generation
```javascript
// Connector generates QR code
connector → backend: POST /api/whatsapp/connector
{
  "event": "qr_generated",
  "data": { "qr_code": "..." }
}
```

### 2. Client Authentication
```javascript
// User scans QR code
connector → backend: POST /api/whatsapp/connector
{
  "event": "client_ready",
  "data": { "session_id": "main" }
}
```

### 3. Message Processing
```javascript
// New WhatsApp message received
connector → backend: POST /api/whatsapp/connector
{
  "event": "message_received",
  "data": {
    "from": "5511999999999@c.us",
    "body": "Hello!",
    "contact": { "name": "John Doe" }
  }
}
```

## 🔍 Monitoring

### Health Check Response
```json
{
  "status": "ok",
  "message": "BudBot WhatsApp Connector v5.0 is running",
  "client_ready": true,
  "qr_generated": false,
  "backend_url": "https://budbot-ia.onrender.com",
  "uptime_seconds": 3600,
  "stats": {
    "total_messages": 42,
    "last_message": "2025-08-07T14:30:00.000Z",
    "reconnections": 0
  },
  "version": "5.0.0"
}
```

### Status Response
```json
{
  "connector_version": "5.0.0",
  "client_ready": true,
  "qr_generated": false,
  "backend_url": "https://budbot-ia.onrender.com",
  "retry_count": 0,
  "max_retries": 5,
  "connection_stats": {
    "startTime": "2025-08-07T14:00:00.000Z",
    "totalMessages": 42,
    "reconnections": 0
  }
}
```

## 🛠️ Troubleshooting

### Common Issues

#### QR Code Not Generating
```bash
# Check Puppeteer configuration
echo $PUPPETEER_EXECUTABLE_PATH

# Verify Chromium installation
/usr/bin/chromium --version
```

#### Backend Connection Issues
```bash
# Test backend connectivity
curl -X POST $BACKEND_URL/api/whatsapp/connector \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -d '{"event":"test"}'
```

#### Memory Issues on Render.com
- Connector includes memory optimization flags
- Uses single-process Puppeteer configuration
- Automatic garbage collection enabled

### Log Analysis

```bash
# View real-time logs
tail -f whatsapp-connector.log

# Check for errors
grep ERROR whatsapp-connector.log

# Monitor backend communication
grep "backend" whatsapp-connector.log
```

## 🔐 Security Features

- **Token-based Authentication** - Secure backend communication
- **Non-root Container** - Docker security best practices
- **Input Validation** - All incoming data validated
- **Error Handling** - Comprehensive error management
- **Structured Logging** - Audit trail for all operations

## 📈 Performance Optimizations

- **Connection Pooling** - Efficient HTTP connections
- **Memory Management** - Optimized for low-memory environments
- **Retry Logic** - Exponential backoff for failed requests
- **Session Persistence** - WhatsApp session stored locally
- **Health Checks** - Proactive monitoring

## 🎯 Production Deployment

### Prerequisites
1. Node.js 18+ runtime
2. Chromium browser installed
3. BudBot-IA backend deployed and accessible
4. PostgreSQL database configured

### Deployment Steps
1. Upload project to Git repository
2. Connect to Render.com
3. Configure environment variables
4. Deploy using Node.js native runtime
5. Monitor health endpoints

### Post-Deployment Verification
```bash
# Verify connector is running
curl https://your-connector.onrender.com/health

# Check QR code availability
curl https://your-connector.onrender.com/qr

# Monitor logs in Render.com dashboard
```

## 📊 Metrics & Analytics

The connector automatically tracks:
- Total messages processed
- Connection uptime
- Reconnection events
- Backend communication success rate
- QR code generation frequency

## 🤝 Integration with BudBot-IA

### Backend Requirements
The BudBot-IA backend must have:
- Route: `POST /api/whatsapp/connector`
- Authentication: Bearer token verification
- Database: PostgreSQL with leads/messages tables

### Supported Events
- `qr_generated` - QR code ready for scanning
- `client_ready` - WhatsApp connected successfully
- `authenticated` - Session restored
- `message_received` - New incoming message
- `disconnected` - Connection lost

## 📝 Version History

- **v5.0.0** - Complete backend integration, production ready
- **v4.4.0** - Render.com compatibility fixes
- **v4.3.0** - Docker optimization
- **v4.2.0** - Memory optimization
- **v4.1.0** - Initial WhatsApp Web integration

## 🆘 Support

For issues and support:
1. Check `/health` endpoint for system status
2. Review logs in `whatsapp-connector.log`
3. Verify environment variables
4. Test backend connectivity
5. Check Render.com deployment logs

## 📄 License

MIT License - Production ready for commercial use.