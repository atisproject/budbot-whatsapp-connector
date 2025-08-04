# 📱 BudBot WhatsApp Connector - CORRIGIDO

**Sistema Node.js para conectar WhatsApp Web ao BudBot-IA**

## 🚨 CORREÇÃO APLICADA

O erro `Root directory 'whatsapp-connector' does not exist` foi corrigido removendo a configuração `rootDir` do `render.yaml`. Agora o deploy funcionará corretamente.

## 🛠️ INSTRUÇÕES DE DEPLOY NO RENDER.COM

### Passo 1: Atualizar Repositório GitHub
1. Baixe e extraia este ZIP corrigido
2. Substitua todos os arquivos do repositório GitHub
3. Commit e push:
```bash
git add .
git commit -m "Fix: removido rootDir do render.yaml"
git push origin main
```

### Passo 2: Reconfigurar Deploy no Render.com
1. Acesse o painel do serviço WhatsApp Connector
2. Vá em **Settings**
3. Em **Build & Deploy**, verifique:
   - **Root Directory**: deixar VAZIO
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Passo 3: Variáveis de Ambiente
Configure no Render.com:
```env
BUDBOT_API_URL=https://seu-budbot-ia.onrender.com
API_SECRET=budbot-secret-key
NODE_ENV=production
PORT=10000
```

### Passo 4: Redeploy
1. Clique em **Manual Deploy** → **Deploy latest commit**
2. Aguarde o build completar
3. Verificar logs para QR Code
4. Escanear com WhatsApp

## ✅ VERIFICAÇÃO

Após o deploy, teste:
```bash
# Status do serviço
curl https://seu-whatsapp-connector.onrender.com/health

# Deve retornar:
{
  "status": "online",
  "whatsapp_ready": false,
  "uptime": 120,
  ...
}
```

## 🔗 INTEGRAÇÃO

No sistema BudBot-IA principal, configure:
```env
WHATSAPP_CONNECTOR_SECRET=budbot-secret-key
```

A integração acontecerá automaticamente quando ambos os serviços estiverem online.

---

**✅ Esta versão corrige o erro de deploy no Render.com!**