// src/bot.js

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
require('./utils/scheduler'); // Scheduler se auto-initializa

// Datos en memoria (equivalente a lo que había en cotizadoresData.js)
const baseUrl = 'https://vendor.tu7.cl/account';
const cotizadoresInfo = {
  1: { user: 'cam.reyesmora@gmail.com', password: 'cotizador1' },
  2: { user: 'naranjo.paula.ps@gmail.com', password: 'cotizador2' },
  3: { user: 'freyes.mora@gmail.com', password: 'cotizador3' },
};
const bicevida = { user: 'biceUserReal', password: 'BicePass!' };

// Estado de slots: false = libre, true = ocupado
const slots = { 1: false, 2: false, 3: false };

// — Express para keep-alive o webhooks
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot en funcionamiento!'));
app.listen(port, () => console.log(`Servidor iniciado en puerto ${port}`));

// — WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote'
    ],
    executablePath: process.env.CHROMIUM_PATH || null
  }
});

client.on('qr', qr => {
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
  console.log('Escanea este QR:', qrImageUrl);
});
client.on('ready', () => console.log('✅ Cliente listo!'));
client.on('auth_failure', () => console.log('⚠️ Error de autenticación'));

client.on('message', async msg => {
  const text = msg.body.trim().toLowerCase();
  let m;

  // — 1) Asignar cotizador: @cotizador1|2|3
  if (m = text.match(/^@cotizador([123])$/)) {
    const n = +m[1];
    if (!slots[n]) {
      slots[n] = true;

      // Construir mensaje detallado
      let reply = `*Cotizadores Mejora Tu Salud*\n\n`;
      reply += `Web: ${baseUrl}\n\n`;
      reply += `*Cotizador asignado:* ${n} ✅\n`;
      reply += `• Usuario: ${cotizadoresInfo[n].user}\n`;
      reply += `• Contraseña: ${cotizadoresInfo[n].password}\n\n`;
      reply += `*Estado de todos los cotizadores:*\n`;
      [1,2,3].forEach(i => {
        reply += `${slots[i] ? '❌' : '✅'} Cotizador ${i}: ${slots[i] ? 'Ocupado' : 'Disponible'}\n`;
      });
      reply += `\n*Cotizador BICEVIDA:*\n`;
      reply += `• Usuario: ${bicevida.user}\n`;
      reply += `• Contraseña: ${bicevida.password}`;

      return msg.reply(reply);
    } else {
      return msg.reply(`❌ El cotizador ${n} ya está ocupado.`);
    }
  }

  // — 2) Liberar cotizador: @cotizador1off|2off|3off
  if (m = text.match(/^@cotizador([123])off$/)) {
    const n = +m[1];
    if (slots[n]) {
      slots[n] = false;
      return msg.reply(`✅ Cotizador ${n} liberado.`);
    } else {
      return msg.reply(`⚠️ El cotizador ${n} ya estaba libre.`);
    }
  }

  // — 3) Otros comandos (beneficios, turnos, etc.)...
  //    (aquí mantienes tu lógica actual de @beneficios y @turnos)
});

client.initialize();