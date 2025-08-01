# Guia de Deploy - WhatsApp Connector

## 🚀 Deploy no Render.com

### Passo 1: Preparar o Repositório

1. **Criar repositório no GitHub**
```bash
# Se ainda não tiver um repositório
git init
git add .
git commit -m "Initial commit with WhatsApp Connector"
git remote add origin https://github.com/SEU-USUARIO/budbot-ia.git
git push -u origin main
```

### Passo 2: Deploy do Sistema Principal (BudBot-IA)

1. **Acessar Render.com**
2. **Criar novo Web Service**
3. **Conectar ao GitHub** e selecionar seu repositório
4. **Configurar**:
   - **Name**: `budbot-ia-main`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Plan**: `Starter` (ou superior)

5. **Variáveis de Ambiente**:
```
DATABASE_URL=postgresql://... (gerado automaticamente)
SESSION_SECRET=... (gerado automaticamente)
OPENAI_API_KEY=sk-sua-chave-openai
WHATSAPP_CONNECTOR_SECRET=chave-secreta-compartilhada
```

### Passo 3: Deploy do WhatsApp Connector

1. **Criar segundo Web Service no Render**
2. **Usar o mesmo repositório GitHub**
3. **Configurar**:
   - **Name**: `budbot-whatsapp-connector`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `./whatsapp-connector/Dockerfile`
   - **Plan**: `Starter`

4. **Variáveis de Ambiente**:
```
PORT=3000
BUDBOT_API_URL=https://budbot-ia-main.render.com
API_SECRET=chave-secreta-compartilhada (mesma do passo anterior)
NODE_ENV=production
```

### Passo 4: Configurar Comunicação Entre Sistemas

1. **No sistema principal**, a URL da API será:
   - `https://budbot-ia-main.render.com`

2. **No WhatsApp Connector**, configure:
   - `BUDBOT_API_URL=https://budbot-ia-main.render.com`

### Passo 5: Primeiro Acesso

1. **Acessar sistema principal**:
   - URL: `https://budbot-ia-main.render.com`
   - Criar conta admin
   - Configurar OpenAI API Key

2. **Conectar WhatsApp**:
   - URL: `https://budbot-whatsapp-connector.render.com/qr`
   - Escanear QR Code com WhatsApp
   - Aguardar confirmação de conexão

### Passo 6: Testar Integração

1. **Verificar status**:
```bash
# Status do sistema principal
curl https://budbot-ia-main.render.com/api/whatsapp/status

# Status do WhatsApp Connector
curl https://budbot-whatsapp-connector.render.com/status
```

2. **Enviar mensagem de teste**:
   - Envie uma mensagem para o número conectado
   - Verifique se aparece no dashboard do BudBot-IA
   - Confirme se houve resposta automática

## 🔧 Configurações de Produção

### Segurança
- Use chaves API_SECRET fortes e únicas
- Configure CORS adequadamente
- Ative logs de auditoria

### Performance
- Configure health checks
- Monitore uso de memória
- Use plan adequado no Render

### Backup
- Backup automático do PostgreSQL
- Exportar configurações importantes
- Documentar integrações

## 🚨 Troubleshooting

### WhatsApp desconecta
- Verificar se o celular está online
- Gerar novo QR Code
- Verificar logs do container

### Mensagens não chegam
- Verificar URL de comunicação
- Validar chaves de API
- Confirmar status das conexões

### Deploy falha
- Verificar Dockerfile
- Confirmar dependências
- Checar logs de build

## 📊 Monitoramento

### Métricas importantes
- Uptime dos serviços
- Quantidade de mensagens processadas
- Latência de resposta
- Uso de memória

### Logs
- Logs estruturados em JSON
- Integração com serviços de monitoramento
- Alertas para erros críticos

## 🔄 Atualizações

### Deploy automático
- Configurado via GitHub
- Branch main = produção
- Tests automatizados (recomendado)

### Rollback
- Usar interface do Render
- Manter backups de configuração
- Testar em staging primeiro

## 💡 Dicas de Produção

1. **Use HTTPS** sempre
2. **Configure logs adequados**
3. **Monitore performance**
4. **Mantenha backups**
5. **Documente mudanças**
6. **Teste antes de deploy**
7. **Use staging environment**