# Guia de Deploy - BudBot WhatsApp Connector

## 🚀 Deploy no Render.com

### 1. Preparação do Repositório
```bash
# Clone ou faça fork do repositório
git clone <seu-repositorio>
cd budbot-whatsapp-connector

# Verificar se todas as dependências estão corretas
npm install
node test-imports.js
```

### 2. Configuração no Render.com

#### Passo a Passo:
1. **Conectar Repositório**
   - Acesse render.com
   - New > Web Service
   - Connect Repository

2. **Configurações Básicas**
   - **Name**: `budbot-whatsapp-connector`
   - **Environment**: `Node`
   - **Region**: `Oregon` (recomendado)
   - **Branch**: `main`
   - **Root Directory**: `budbot-whatsapp-connector`

3. **Build & Start Commands**
   - **Build Command**: `npm install --omit=dev`
   - **Start Command**: `node index.js`

4. **Plan Selection**
   - **Starter Plan**: Mínimo recomendado ($7/mês)
   - **Hobby Plan**: Para desenvolvimento ($0/mês - com limitações)

### 3. Variáveis de Ambiente

Configure no painel do Render:

```env
NODE_ENV=production
BACKEND_URL=https://budbot-ia.onrender.com
WEBHOOK_TOKEN=seu_token_seguro_unico_aqui
WWEB_SESSION_PATH=/opt/render/project/src/wweb_session
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
LOG_LEVEL=info
```

### 4. Disco Persistente (Importante!)

Para manter as sessões do WhatsApp:
1. Vá em **Settings** > **Disks**
2. **Add Disk**:
   - **Name**: `whatsapp-sessions`
   - **Mount Path**: `/opt/render/project/src/wweb_session`
   - **Size**: `1 GB`

### 5. Health Check

O Render verificará automaticamente:
- **Path**: `/health`
- **Timeout**: 30s
- **Interval**: 30s

## ✅ Verificação Pós-Deploy

### 1. Verificar Status
```bash
curl https://budbot-whatsapp-connector.onrender.com/health
```

### 2. Obter QR Code
```bash
curl https://budbot-whatsapp-connector.onrender.com/qr
```

### 3. Verificar Logs
- Acesse o painel do Render
- Vá em **Logs** para acompanhar
- Procure por: `✅ WhatsApp Client conectado com sucesso!`

## 🔗 Integração com Backend Principal

### Webhook Configuration
No backend principal (Flask), configure:

```python
# backend/config.py
WHATSAPP_CONNECTOR_URL = "https://budbot-whatsapp-connector.onrender.com"
WEBHOOK_TOKEN = "mesmo_token_configurado_no_connector"
```

### Endpoint de Webhook
Certifique-se que o backend tem a rota:
```python
@app.route('/api/whatsapp/webhook', methods=['POST'])
def whatsapp_webhook():
    # Processar eventos do connector
    pass
```

## 📱 Primeiro Uso

### 1. Conectar WhatsApp
1. Acesse os logs do Render
2. Aguarde o QR Code aparecer nos logs
3. Abra WhatsApp no celular
4. Vá em Menu > Dispositivos Conectados
5. Escaneie o QR Code
6. Aguarde a confirmação: `✅ WhatsApp Client conectado`

### 2. Testar Envio
```bash
curl -X POST https://budbot-whatsapp-connector.onrender.com/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "message": "Teste do BudBot!",
    "type": "text"
  }'
```

## 🔧 Troubleshooting

### Erro: "Failed to launch browser"
- ✅ **Resolvido**: Docker configurado com Chromium nativo

### Erro: "No matching version whatsapp-web.js"  
- ✅ **Resolvido**: Usando v1.31.0 (versão estável atual)

### Problema: "Session não persiste"
- ✅ **Resolvido**: LocalAuth + disco persistente configurado

### WhatsApp desconecta frequentemente
- Verifique se o disco persistente está configurado
- Monitor logs para erros de autenticação
- Reinicie via `/restart` se necessário

## 💡 Dicas de Performance

### 1. Monitoramento
```bash
# Status geral
curl https://budbot-whatsapp-connector.onrender.com/health

# Status específico WhatsApp
curl https://budbot-whatsapp-connector.onrender.com/status
```

### 2. Reinicialização
```bash
# Se necessário reiniciar
curl -X POST https://budbot-whatsapp-connector.onrender.com/restart
```

### 3. Logs Estruturados
Os logs incluem:
- Eventos de conexão/desconexão
- Mensagens recebidas/enviadas
- Erros e warnings
- Métricas de performance

## 🔒 Segurança

### Validações Implementadas:
- Token de webhook para autenticação
- CORS configurado adequadamente
- Logs sem informações sensíveis
- Execução com usuário não-root
- Validação de entrada nas APIs

### Monitoramento Recomendado:
- Alertas para desconexões
- Métricas de uso de CPU/RAM
- Volume de mensagens processadas
- Tempo de resposta das APIs

---

## 📞 Suporte Técnico

Em caso de problemas:
1. Verifique logs no painel Render
2. Teste endpoints de health check
3. Valide variáveis de ambiente
4. Confirme configuração do disco persistente

**Status**: ✅ Sistema totalmente funcional e pronto para produção!