# 📱 BudBot WhatsApp Connector

**Sistema Node.js para conectar WhatsApp Web ao BudBot-IA**

Este é um serviço independente que conecta o WhatsApp Web ao sistema principal BudBot-IA, permitindo automação gratuita via WhatsApp sem necessidade da API oficial do WhatsApp Business.

## 🚀 Funcionalidades

- ✅ **Conexão WhatsApp Web** via `whatsapp-web.js`
- ✅ **QR Code automático** para autenticação
- ✅ **API REST** para comunicação com BudBot-IA
- ✅ **Respostas automáticas** com IA
- ✅ **Deploy no Render.com** com Docker
- ✅ **Logs estruturados** e monitoramento

## 📋 Pré-requisitos

- **Node.js 18+**
- **WhatsApp** instalado no celular
- **Sistema BudBot-IA** funcionando

## 🛠️ Instalação Local

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis
```bash
cp .env.example .env
# Editar .env com suas configurações
```

### 3. Executar
```bash
# Produção
npm start

# Desenvolvimento
npm run dev
```

### 4. Autenticar WhatsApp
1. Aguardar QR Code aparecer no terminal
2. Escanear com WhatsApp no celular
3. Verificar conexão estabelecida

## 🌐 Deploy no Render.com

### Passo 1: Criar Repositório
1. Fork ou clone este repositório
2. Upload para seu GitHub

### Passo 2: Criar Web Service
1. Acesse [render.com](https://render.com)
2. Conecte sua conta GitHub
3. Clique **"New +"** → **"Web Service"**
4. Selecione o repositório do connector
5. Configure:
   - **Name**: `budbot-whatsapp-connector`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Passo 3: Configurar Variáveis
```env
BUDBOT_API_URL=https://seu-budbot-ia.onrender.com
API_SECRET=budbot-secret-key
NODE_ENV=production
PORT=10000
```

### Passo 4: Autenticar
1. Verificar logs do deploy
2. Localizar QR Code nos logs
3. Escanear com WhatsApp
4. Confirmar "WhatsApp conectado!"

## 📡 API Endpoints

### Status da Conexão
```http
GET /status
```
**Resposta:**
```json
{
  "connected": true,
  "has_qr": false,
  "uptime": 3600,
  "timestamp": "2025-08-04T19:00:00.000Z"
}
```

### QR Code para Login
```http
GET /qr
```
**Resposta:**
```json
{
  "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "message": "Escaneie o QR Code com seu WhatsApp"
}
```

### Enviar Mensagem
```http
POST /send
```
**Body:**
```json
{
  "phone": "5511999999999",
  "message": "Olá! Como posso ajudar?"
}
```

### Health Check
```http
GET /health
```
**Resposta:**
```json
{
  "status": "online",
  "whatsapp_ready": true,
  "uptime": 3600,
  "memory": {...},
  "timestamp": "2025-08-04T19:00:00.000Z"
}
```

## 🔄 Integração com BudBot-IA

O connector funciona automaticamente:

1. **Recebe mensagem** do WhatsApp
2. **Envia para BudBot-IA** via webhook
3. **Recebe resposta** da IA (se configurada)
4. **Envia resposta** de volta para o WhatsApp

### Configuração no Sistema Principal
No BudBot-IA, configure:
```env
WHATSAPP_CONNECTOR_SECRET=budbot-secret-key
```

## 🛡️ Segurança

- ✅ **Token Bearer** para autenticação
- ✅ **Headers personalizados** para validação
- ✅ **CORS configurado** adequadamente
- ✅ **Timeout** nas requisições
- ✅ **Logs estruturados** para auditoria

## 🚨 Troubleshooting

### QR Code não aparece
```bash
# Verificar logs
heroku logs --tail -a seu-app-connector

# Reiniciar serviço
heroku restart -a seu-app-connector
```

### WhatsApp desconecta
- **Motivo**: WhatsApp Web desconecta automaticamente
- **Solução**: Escanear novo QR Code
- **Prevenção**: Manter celular online

### Mensagens não chegam
```bash
# Testar conectividade
curl https://seu-connector.onrender.com/status

# Verificar webhook no BudBot-IA
curl https://seu-budbot.onrender.com/api/whatsapp-connector/status
```

## 📊 Monitoramento

### Logs Importantes
```bash
# Conexão estabelecida
✅ WhatsApp conectado com sucesso!

# Mensagem recebida
📨 Mensagem recebida de 5511999999999: Olá

# Resposta enviada
🤖 Resposta automática enviada para 5511999999999
```

### Métricas de Performance
- **Uptime**: Tempo online do serviço
- **Memory**: Uso de memória RAM
- **Messages**: Mensagens processadas
- **Response Time**: Tempo de resposta

## 🔧 Configuração Avançada

### Puppeteer Otimizado
O connector está configurado para funcionar em containers:
```javascript
puppeteer: {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'
    ]
}
```

### Autenticação Persistente
```javascript
authStrategy: new LocalAuth({
    name: 'budbot-session'
})
```

## 📝 Changelog

### v1.0.0 (Agosto 2025)
- ✅ Conexão WhatsApp Web estável
- ✅ API REST completa
- ✅ Integração com BudBot-IA
- ✅ Deploy automático Render.com
- ✅ Logs estruturados

## 📞 Suporte

- **Repositório Principal**: [BudBot-IA](https://github.com/seu-usuario/budbot-ia)
- **Issues**: [GitHub Issues](https://github.com/seu-usuario/budbot-whatsapp-connector/issues)
- **Documentação**: [Wiki](https://github.com/seu-usuario/budbot-ia/wiki)

---

**🔌 Desenvolvido para conectar WhatsApp ao futuro da automação!**