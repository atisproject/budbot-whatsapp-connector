# 🚀 BudBot WhatsApp Connector v5.0 - Complete Deployment Guide

## 📋 Overview

This guide provides step-by-step instructions for deploying the complete BudBot WhatsApp Connector v5.0 system, including both the connector service and backend integration.

## 🏗️ Architecture

```
WhatsApp Web ←→ Connector (Node.js) ←→ BudBot-IA Backend (Flask) ←→ PostgreSQL
```

## 📦 What's Included

- **WhatsApp Connector v5.0** - Production-ready Node.js service
- **Backend Integration** - Flask blueprint for handling connector events  
- **Complete Documentation** - Deployment, configuration, and troubleshooting guides
- **Docker Support** - Optimized containers for Render.com
- **Health Monitoring** - Comprehensive status endpoints

## 🚀 Deployment Options

### Option 1: Render.com (Recommended)

#### Step 1: Deploy WhatsApp Connector

1. **Create new service on Render.com**
   - Service Type: `Web Service`
   - Connect your Git repository
   - Branch: `main`

2. **Configure Build Settings**
   ```
   Environment: Node
   Build Command: npm install --omit=dev --no-audit --no-fund
   Start Command: node index.js
   Auto-Deploy: Yes
   ```

3. **Set Environment Variables**
   ```
   NODE_ENV=production
   PORT=3000
   BACKEND_URL=https://your-backend.onrender.com
   WEBHOOK_TOKEN=budbot_webhook_secret_2025
   WWEB_SESSION_PATH=./wweb_session
   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
   LOG_LEVEL=info
   ```

4. **Deploy and Verify**
   ```bash
   # Check health
   curl https://your-connector.onrender.com/health
   
   # Check status
   curl https://your-connector.onrender.com/status
   ```

#### Step 2: Deploy Backend Integration

1. **Add Files to Your Backend Repository**
   - Copy `backend/whatsapp_connector.py` to your backend project
   - Update `app.py` to register the blueprint (see `backend/app_integration.py`)
   - Ensure models are compatible (see `backend/models_example.py`)

2. **Update app.py Registration**
   ```python
   # Add to register_blueprints function
   from backend.whatsapp_connector import whatsapp_connector_bp
   app.register_blueprint(whatsapp_connector_bp, url_prefix='/api/whatsapp')
   ```

3. **Set Backend Environment Variables**
   ```
   WEBHOOK_TOKEN=budbot_webhook_secret_2025
   ```

4. **Deploy Backend**
   - Commit changes to Git
   - Push to trigger auto-deploy on Render.com
   - Or use Manual Deploy in Render.com dashboard

5. **Test Integration**
   ```bash
   # Test connector communication
   curl -X POST https://your-backend.onrender.com/api/whatsapp/connector \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer budbot_webhook_secret_2025" \
     -d '{"event": "qr_generated", "data": {"qr_code": "test"}}'
   
   # Expected response:
   # {"status": "ok", "message": "QR code received"}
   ```

### Option 2: Docker Deployment

#### Step 1: Build Connector Image

```bash
# Build Docker image
docker build -t budbot-whatsapp-connector:5.0 .

# Run container
docker run -d \
  --name budbot-connector \
  -p 3000:3000 \
  -e BACKEND_URL=https://your-backend.onrender.com \
  -e WEBHOOK_TOKEN=budbot_webhook_secret_2025 \
  budbot-whatsapp-connector:5.0
```

#### Step 2: Deploy to Container Platform

- **Render.com**: Connect repository, select Docker environment
- **Railway**: Import from GitHub, automatic Docker detection
- **Heroku**: Use container registry
- **DigitalOcean App Platform**: Create app from Docker source

## 🔧 Configuration

### Required Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BACKEND_URL` | BudBot-IA backend URL | `https://budbot-ia.onrender.com` | Yes |
| `WEBHOOK_TOKEN` | Security token | `budbot_webhook_secret_2025` | Yes |
| `NODE_ENV` | Environment | `production` | Yes |
| `PORT` | Server port | `3000` | No |

### Optional Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level | `info` |
| `MAX_RETRIES` | Max reconnection attempts | `5` |
| `RETRY_DELAY` | Retry delay (ms) | `5000` |
| `WWEB_SESSION_PATH` | Session storage path | `./wweb_session` |

### Render.com Specific

| Variable | Description | Value |
|----------|-------------|-------|
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | Skip Chromium download | `true` |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium path | `/usr/bin/chromium` |

## ✅ Post-Deployment Verification

### 1. Connector Health Check

```bash
curl https://your-connector.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "BudBot WhatsApp Connector v5.0 is running",
  "client_ready": false,
  "qr_generated": false,
  "backend_url": "https://your-backend.onrender.com",
  "version": "5.0.0"
}
```

### 2. Backend Integration Test

```bash
curl -X POST https://your-backend.onrender.com/api/whatsapp/connector \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer budbot_webhook_secret_2025" \
  -d '{"event": "test"}'
```

### 3. QR Code Generation

1. Monitor connector logs in Render.com dashboard
2. Look for QR code generation messages
3. Access QR code via `/qr` endpoint
4. Scan with WhatsApp mobile app

### 4. Message Flow Test

1. Send test message to WhatsApp number
2. Check connector logs for message processing
3. Verify message appears in backend database
4. Confirm lead creation in CRM

## 🔍 Monitoring

### Health Endpoints

- **Connector Health**: `GET /health`
- **Detailed Status**: `GET /status`  
- **QR Code Access**: `GET /qr`
- **Backend Health**: `GET /api/whatsapp/connector/health`

### Log Monitoring

- **Render.com**: Use built-in log viewer
- **Local**: Check `whatsapp-connector.log` file
- **Docker**: `docker logs container-name`

### Key Metrics

- Connection uptime
- Message processing count
- Reconnection events
- Backend communication success rate
- QR code generation frequency

## 🛠️ Troubleshooting

### Common Issues

#### 1. QR Code Not Generating

**Symptoms:**
- No QR code in logs
- `/qr` endpoint returns unavailable

**Solutions:**
```bash
# Check Puppeteer configuration
echo $PUPPETEER_EXECUTABLE_PATH

# Verify Chromium installation (in container)
/usr/bin/chromium --version

# Check memory usage
free -h
```

#### 2. Backend Connection Failed (404)

**Symptoms:**
- "Failed to notify backend: 404" in logs
- Backend returns "Not Found"

**Solutions:**
```bash
# Verify backend route exists
curl https://your-backend.onrender.com/api/whatsapp/connector/health

# Check backend deployment
# Ensure whatsapp_connector.py is deployed
# Verify blueprint registration in app.py
```

#### 3. Authentication Failures

**Symptoms:**
- "Invalid webhook token" errors
- 401 Unauthorized responses

**Solutions:**
```bash
# Verify token consistency
echo $WEBHOOK_TOKEN

# Check Authorization header
curl -v -H "Authorization: Bearer your-token" your-endpoint
```

#### 4. Memory Issues

**Symptoms:**
- "Target closed" errors
- Frequent disconnections
- Container restarts

**Solutions:**
- Connector includes memory optimization
- Uses single-process Puppeteer
- Automatic garbage collection enabled
- Consider upgrading to higher memory plan

### Log Analysis

```bash
# Real-time monitoring
tail -f whatsapp-connector.log

# Error analysis
grep ERROR whatsapp-connector.log

# Backend communication
grep "backend" whatsapp-connector.log

# Connection events
grep -E "(connected|disconnected|qr_generated)" whatsapp-connector.log
```

## 🔐 Security Considerations

### Production Security

- **Token Security**: Use strong, unique webhook tokens
- **HTTPS Only**: All communication over HTTPS
- **Container Security**: Non-root user in Docker
- **Input Validation**: All webhook data validated
- **Error Handling**: No sensitive data in error messages

### Recommended Practices

1. **Rotate Tokens**: Regular token rotation
2. **Monitor Logs**: Watch for unauthorized access attempts
3. **Network Security**: Restrict access to webhook endpoints
4. **Database Security**: Use PostgreSQL with SSL
5. **Backup Strategy**: Regular session and database backups

## 📈 Performance Optimization

### Render.com Optimizations

- Use Node.js native runtime (faster than Docker)
- Enable auto-scaling if needed
- Monitor resource usage in dashboard
- Use persistent disks for session storage

### Connection Optimizations

- Session persistence reduces reconnection time
- Retry logic handles temporary failures
- Health checks enable proactive monitoring
- Memory optimization prevents crashes

## 🆘 Support

### Getting Help

1. **Check Health Endpoints**: Start with `/health` and `/status`
2. **Review Logs**: Look for specific error messages
3. **Verify Configuration**: Ensure all environment variables are set
4. **Test Connectivity**: Verify backend and database connections
5. **Monitor Resources**: Check memory and CPU usage

### Escalation Process

1. **Basic Issues**: Check this documentation
2. **Configuration Issues**: Review environment variables
3. **Connectivity Issues**: Test endpoints manually
4. **Performance Issues**: Check resource usage
5. **Complex Issues**: Review full logs and architecture

## 📊 Success Metrics

### Deployment Success Indicators

- ✅ Connector health endpoint returns 200 OK
- ✅ Backend integration endpoint returns 200 OK
- ✅ QR code generates within 60 seconds
- ✅ WhatsApp connection established successfully
- ✅ Test messages processed and stored in database
- ✅ No error messages in logs for 10 minutes

### Ongoing Monitoring

- Uptime > 99%
- Message processing latency < 5 seconds
- Reconnection frequency < 1 per hour
- Backend communication success rate > 95%
- Memory usage stable < 80% of allocation

This deployment guide ensures a successful BudBot WhatsApp Connector v5.0 implementation with complete backend integration.