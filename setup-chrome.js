#!/usr/bin/env node
/**
 * Setup script para instalar Chrome no Render.com
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Configurando Chrome para Render.com...');

try {
  // Verificar se estamos no Render.com
  if (process.env.RENDER) {
    console.log('📦 Ambiente Render.com detectado');
    
    // Criar diretório para Chrome
    const chromeDir = '/opt/render/project/.render/chrome';
    
    if (!fs.existsSync(chromeDir)) {
      console.log('📁 Criando diretório para Chrome...');
      execSync(`mkdir -p ${chromeDir}`, { stdio: 'inherit' });
    }
    
    // Verificar se Chrome já está instalado
    const chromePath = path.join(chromeDir, 'opt/google/chrome/google-chrome');
    
    if (!fs.existsSync(chromePath)) {
      console.log('⬇️ Baixando Chrome...');
      
      // Download e instalação do Chrome
      const commands = [
        `cd ${chromeDir}`,
        'wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -',
        'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list',
        'apt-get update',
        'apt-get install -y google-chrome-stable',
        'which google-chrome-stable'
      ];
      
      commands.forEach(cmd => {
        try {
          execSync(cmd, { stdio: 'inherit' });
        } catch (error) {
          console.log(`⚠️ Comando falhou: ${cmd}`);
        }
      });
    }
    
    console.log('✅ Chrome configurado com sucesso!');
  } else {
    console.log('🏠 Ambiente local detectado - usando Chrome do sistema');
  }
} catch (error) {
  console.log('⚠️ Erro na configuração do Chrome:', error.message);
  console.log('📱 Continuando sem Chrome customizado...');
}

console.log('🎉 Setup concluído!');