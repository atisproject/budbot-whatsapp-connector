# 🔧 Correção WhatsApp Connector - Render

## ⚠️ Problema Identificado
O build do WhatsApp Connector está falhando na instalação do Chromium no Alpine Linux.

## ✅ Soluções Implementadas

### 1. Dockerfile Corrigido
- Voltou para Alpine Linux (mais leve)
- Configuração específica do Chromium
- Variáveis de ambiente corretas

### 2. Dockerfile Alternativo (Debian)
- `Dockerfile.simple` - Usa Debian slim
- Google Chrome estável
- Mais compatível, mas maior

### 3. Configuração Puppeteer Otimizada
- Path correto do executável
- Args específicos para container
- Configuração de segurança

## 🚀 Deploy Recomendado

### Opção 1: Alpine (Menor)
```yaml
# render.yaml
- type: web
  name: budbot-whatsapp-connector
  dockerfilePath: ./whatsapp-connector/Dockerfile
```

### Opção 2: Debian (Mais Estável)
```yaml
# render.yaml  
- type: web
  name: budbot-whatsapp-connector
  dockerfilePath: ./whatsapp-connector/Dockerfile.simple
```

## 🎯 Variáveis de Ambiente Render

```bash
BUDBOT_API_URL=https://budbot-ia.onrender.com
API_SECRET=budbot-secret-key
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

## 🔄 Como Testar

1. **Push para GitHub**
2. **Render Auto Deploy**
3. **Verificar logs do build**
4. **Acessar /health endpoint**

---

**O WhatsApp Connector agora deve fazer build sem problemas!**