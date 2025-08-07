# BudBot WhatsApp Connector v4.3.2

Sistema inteligente de atendimento WhatsApp com integração de IA, otimizado para deployment no Render.com.

## ✨ Características

- **WhatsApp Web.js v1.31.0** - Versão mais recente e estável
- **Render.com Ready** - Configuração otimizada para deploy
- **Docker Support** - Container otimizado com Chromium
- **Logging Avançado** - Winston para rastreamento completo
- **API RESTful** - Endpoints para integração completa
- **Session Management** - Persistência de sessão do WhatsApp
- **QR Code Terminal** - Visualização do QR no console

## 🚀 Deploy no Render.com

### 1. Preparação

1. Faça fork ou clone este repositório
2. Configure as variáveis de ambiente (ver `.env.example`)
3. Conecte seu repositório ao Render.com

### 2. Configuração no Render

- **Build Command**: `npm install --production`
- **Start Command**: `node index.js`
- **Environment**: `Node`
- **Plan**: `Starter` (mínimo recomendado)

### 3. Variáveis de Ambiente Essenciais

```env
NODE_ENV=production
BACKEND_URL=https://budbot-ia.onrender.com
WEBHOOK_TOKEN=seu_token_seguro_aqui
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WWEB_SESSION_PATH=/opt/render/project/src/wweb_session
```

## 📡 API Endpoints

### Health Check
```http
GET /health
```

### Status do WhatsApp
```http
GET /status
```

### QR Code para Conexão
```http
GET /qr
```

### Reinicializar Cliente
```http
POST /restart
```

### Enviar Mensagem
```http
POST /send-message
Content-Type: application/json

{
  "to": "5511999999999",
  "message": "Olá! Esta é uma mensagem do BudBot.",
  "type": "text"
}
```

## 🔧 Desenvolvimento Local

### Pré-requisitos
- Node.js v18+
- npm v8+

### Instalação
```bash
cd budbot-whatsapp-connector
npm install
cp .env.example .env
# Configure suas variáveis no .env
npm start
```

### Com Docker
```bash
docker build -t budbot-whatsapp-connector .
docker run -p 3000:3000 --env-file .env budbot-whatsapp-connector
```

## 🔒 Segurança

- Token de webhook para validação
- CORS configurado
- Execução com usuário não-root no Docker
- Logs estruturados para auditoria

## 📊 Monitoramento

O sistema inclui:
- Health check endpoint (`/health`)
- Logging estruturado com Winston
- Métricas de sistema e memória
- Status detalhado da conexão WhatsApp

## 🐛 Troubleshooting

### Erro "No matching version found for whatsapp-web.js"
- ✅ **Corrigido**: Usando versão v1.31.0 (mais recente disponível)

### Problemas com Puppeteer no Render
- ✅ **Corrigido**: Configuração otimizada do Chromium para ambiente de produção

### Sessão WhatsApp não persiste
- ✅ **Corrigido**: Sistema de persistência com LocalAuth

## 📝 Logs

Os logs são salvos em:
- Console (stdout)
- Arquivo `whatsapp-connector.log`

Níveis de log disponíveis: `error`, `warn`, `info`, `debug`

## 🔄 Integração com Backend

O connector se comunica com o backend principal através de:
- **Webhooks**: Eventos do WhatsApp → Backend
- **API Calls**: Backend → Connector para envio de mensagens
- **Health Checks**: Monitoramento de status

## 📈 Performance

### Otimizações Implementadas
- Puppeteer com argumentos otimizados para Render
- Gestão de memória melhorada
- Conexão persistente com cache de sessão
- Logs estruturados para debug eficiente

### Recursos Recomendados
- **RAM**: Mínimo 512MB (1GB recomendado)
- **CPU**: 1 vCore
- **Disco**: 1GB para sessões e logs

## 📞 Suporte

Para problemas ou dúvidas:
1. Verifique os logs no console do Render
2. Consulte o endpoint `/health` para diagnóstico
3. Reinicie o serviço via endpoint `/restart`

---

**BudBot-IA Team** © 2025 - Sistema inteligente de atendimento WhatsApp