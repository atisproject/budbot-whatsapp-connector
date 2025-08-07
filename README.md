# BudBot WhatsApp Connector v4.4.0

🚀 **Render.com Ready** - WhatsApp Connector para BudBot-IA com integração completa

## ✅ Arquivos na Raiz (Render.com Compatible)

Este repositório está organizado para deploy direto no Render.com:

```
budbot-whatsapp-connector/
├── index.js          # Aplicação principal
├── package.json      # Dependências NPM
├── Dockerfile        # Container Docker
├── .env.example      # Variáveis de ambiente  
├── README.md         # Esta documentação
└── wweb_session/     # Sessões WhatsApp (criado automaticamente)
```

## 🔧 Deploy no Render.com

### Método 1: Node.js Nativo (Recomendado)

1. **Conecte o repositório GitHub**
2. **Configure as settings:**
   - **Environment:** `Node`
   - **Build Command:** `npm install --omit=dev --no-audit --no-fund`
   - **Start Command:** `node index.js`
   - **Auto-Deploy:** `Yes`

3. **Environment Variables:**
```
NODE_ENV=production
PORT=3000
BACKEND_URL=https://budbot-ia.onrender.com
WEBHOOK_TOKEN=budbot_webhook_secret_2025
WWEB_SESSION_PATH=/opt/render/project/src/wweb_session
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
LOG_LEVEL=info
```

### Método 2: Docker (Alternativo)

O Dockerfile está incluído na raiz para compatibilidade total.

## 🚀 Funcionalidades

- ✅ **WhatsApp Web Integration** com whatsapp-web.js v1.31.0
- ✅ **QR Code Generation** no terminal e interface web
- ✅ **Message Processing** automático para backend
- ✅ **Session Persistence** com LocalAuth
- ✅ **Health Checks** em `/health` e `/status`
- ✅ **Retry Logic** com reconexão automática
- ✅ **Memory Optimization** para Render.com
- ✅ **Complete Logging** com Winston

## 📡 Integração com Backend

O connector se comunica com o backend BudBot-IA via:

**Endpoint:** `POST /api/whatsapp/connector`

**Eventos enviados:**
- `qr_generated` - QR Code gerado
- `client_ready` - Cliente conectado
- `authenticated` - Autenticação bem-sucedida  
- `message_received` - Nova mensagem recebida
- `disconnected` - Desconexão do WhatsApp

## 🔍 Monitoramento

### Health Check
```bash
curl https://seu-app.onrender.com/health
```

### Status
```bash  
curl https://seu-app.onrender.com/status
```

## 📝 Logs

Os logs são salvos em:
- **Console:** Tempo real
- **Arquivo:** `whatsapp-connector.log`

## 🔧 Resolução de Problemas

### QR Code não aparece
- Verifique se `PUPPETEER_EXECUTABLE_PATH` está configurado
- Confirme se o Chromium está instalado no container

### Backend não recebe mensagens
- Confirme `BACKEND_URL` e `WEBHOOK_TOKEN`
- Verifique logs em `/health` endpoint

### Erro de memória no Render.com
- O connector está otimizado com flags de memória
- Processo único do Puppeteer evita vazamentos

## 📦 Versão

**v4.4.0** - Integração completa com backend BudBot-IA funcionando