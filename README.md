# WhatsApp Connector para BudBot-IA

Sistema Node.js que conecta com WhatsApp Web para integração com o BudBot-IA.

## 🚀 Funcionalidades

- **Conexão WhatsApp Web**: Usa a biblioteca `whatsapp-web.js`
- **QR Code**: Geração automática para autenticação
- **API REST**: Endpoints para envio e recebimento de mensagens
- **Integração BudBot-IA**: Comunicação automática com o sistema principal
- **Deploy Render**: Configurado para deploy automático

## 📋 Pré-requisitos

- Node.js 18+
- WhatsApp instalado no celular
- Sistema BudBot-IA rodando

## 🛠️ Instalação Local

1. **Instalar dependências**
```bash
cd whatsapp-connector
npm install
```

2. **Configurar variáveis**
```bash
cp .env.example .env
# Editar .env com suas configurações
```

3. **Executar**
```bash
npm start
# ou para desenvolvimento
npm run dev
```

4. **Escanear QR Code**
- Acesse: http://localhost:3000/qr
- Escaneie com WhatsApp no celular

## 🌐 Deploy no Render

1. **Criar novo Web Service**
2. **Configurar como Docker**
3. **Dockerfile Path**: `./whatsapp-connector/Dockerfile`
4. **Configurar variáveis**:
   - `BUDBOT_API_URL`: URL do BudBot-IA principal
   - `API_SECRET`: Chave secreta compartilhada

## 📡 API Endpoints

### Status da Conexão
```
GET /status
```

### QR Code para Login
```
GET /qr
```

### Enviar Mensagem
```
POST /send
{
  "phone": "5511999999999",
  "message": "Olá! Como posso ajudar?"
}
```

### Informações de Contato
```
GET /contact/:phone
```

### Health Check
```
GET /health
```

## 🔄 Integração com BudBot-IA

O connector se comunica automaticamente com o BudBot-IA:

1. **Recebe mensagem** do WhatsApp
2. **Envia para BudBot-IA** via `/api/whatsapp/receive`
3. **Recebe resposta automática** se disponível
4. **Envia resposta** de volta para o WhatsApp

## 🛡️ Segurança

- Autenticação via token Bearer
- Headers de segurança configurados
- Validação de origem das mensagens
- Ambiente isolado no Docker

## 📊 Monitoramento

- Logs estruturados no console
- Health check endpoint
- Status da conexão WhatsApp
- Métricas de memória e uptime

## 🔧 Configuração BudBot-IA

Adicione essas rotas no sistema principal:

```python
# backend/routes/whatsapp_routes.py
@whatsapp_bp.route('/receive', methods=['POST'])
def receive_message():
    # Processar mensagem do connector
    # Gerar resposta com IA
    # Retornar resposta automática
```

## 🐳 Docker

```bash
# Build
docker build -t budbot-whatsapp-connector .

# Run
docker run -p 3000:3000 \
  -e BUDBOT_API_URL=http://localhost:5000 \
  -e API_SECRET=sua-chave-secreta \
  budbot-whatsapp-connector
```

## 🚨 Troubleshooting

### QR Code não aparece
- Verificar logs do container
- Reiniciar o serviço
- Verificar se Chromium está instalado

### Mensagens não chegam
- Verificar URL do BudBot-IA
- Validar API_SECRET
- Verificar logs de comunicação

### Conexão perdida
- WhatsApp Web desconecta automaticamente
- Reautenticar escaneando novo QR Code
- Verificar se o celular está online