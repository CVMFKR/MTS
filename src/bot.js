// src/bot.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const benefits = require('./data/benefitsData');

console.log('⚙️ benefitsData cargados:', Array.isArray(benefits) ? benefits.length : '¡NO es un array!', 'elementos');

// Datos en memoria para cotizadores
const baseUrl = 'https://vendor.tu7.cl/account';
const cotizadoresInfo = {
  1: { user: 'cam.reyesmora@gmail.com', password: 'cotizador1' },
  2: { user: 'naranjo.paula.ps@gmail.com', password: 'cotizador2' },
  3: { user: 'freyes.mora@gmail.com', password: 'cotizador3' },
};
const bicevida = { user: 'fernanda.lange', password: 'Bice.2020' };
const slots = { 1: false, 2: false, 3: false };
const waitingForBenefitNumber = new Map();

// Express
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot en funcionamiento!'));
app.listen(port, () => console.log(`Servidor iniciado en puerto ${port}`));

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote'
    ]
  }
});

client.on('qr', qr => {
  console.log(`Escanea este QR: https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`);
});

client.on('ready', () => console.log('✅ Cliente listo!'));
client.on('auth_failure', () => console.log('⚠️ Error de autenticación'));

client.on('message', async msg => {
  const text = msg.body.trim().toLowerCase();
  console.log(`[DEBUG] Mensaje entrante de ${msg.from}: "${text}"`);
  let m;

  if (text.startsWith('@beneficios')) {
    console.log('[DEBUG] Se activó comando @beneficios');
    let options = 'Selecciona una opción (responde con el número):\n\n';
    benefits.forEach((b, i) => options += `${i}. ${b.title}\n`);
    await msg.reply(options);
    waitingForBenefitNumber.set(msg.from, true);
    return;
  }

  if (!isNaN(text) && waitingForBenefitNumber.get(msg.from)) {
    const idx = parseInt(text, 10);
    waitingForBenefitNumber.delete(msg.from);
    if (idx < 0 || idx >= benefits.length) {
      return msg.reply(`❌ Opción inválida. Escribe un número entre 0 y ${benefits.length - 1}.`);
    }
    const b = benefits[idx];
    return msg.reply(`*${b.title}*\n\n${b.content}\n\n🌐 Más info: ${b.link}`);
  }

  if (m = text.match(/^@cotizador([123])$/)) {
    const n = +m[1];
    if (!slots[n]) {
      slots[n] = true;
      let reply = `*Cotizadores Mejora Tu Salud*\n\nWeb: ${baseUrl}\n\n`;
      reply += `*Cotizador asignado:* ${n} ✅\n`;
      reply += `• Usuario: ${cotizadoresInfo[n].user}\n`;
      reply += `• Contraseña: ${cotizadoresInfo[n].password}\n\n`;
      reply += `*Estado de todos los cotizadores:*\n`;
      [1,2,3].forEach(i => {
        reply += `${slots[i] ? '❌' : '✅'} Cotizador ${i}: ${slots[i] ? 'Ocupado' : 'Disponible'}\n`;
      });
      reply += `\n*Cotizador BICEVIDA:*\n• Usuario: ${bicevida.user}\n• Contraseña: ${bicevida.password}`;
      return msg.reply(reply);
    } else {
      return msg.reply(`❌ El cotizador ${n} ya está ocupado.`);
    }
  }

  if (m = text.match(/^@cotizador([123])off$/)) {
    const n = +m[1];
    if (slots[n]) {
      slots[n] = false;
      return msg.reply(`✅ Cotizador ${n} liberado.`);
    } else {
      return msg.reply(`⚠️ El cotizador ${n} ya estaba libre.`);
    }
  }
});

client.initialize();
