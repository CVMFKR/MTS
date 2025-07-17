// src/bot.js

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const puppeteer = require('puppeteer');
require('./utils/scheduler'); // Scheduler se auto-inicializa

// Cargamos beneficios y comprobamos estructura
const benefits = require('./data/benefitsData');
console.log('⚙️ benefitsData cargados:', Array.isArray(benefits) ? benefits.length : '¡NO es un array!', 'elementos');

// Datos en memoria para cotizadores
const baseUrl = 'https://vendor.tu7.cl/account';
const cotizadoresInfo = {
  1: { user: 'cam.reyesmora@gmail.com', password: 'cotizador1' },
  2: { user: 'naranjo.paula.ps@gmail.com', password: 'cotizador2' },
  3: { user: 'freyes.mora@gmail.com', password: 'cotizador3' },
};
const bicevida = { user: 'biceUserReal', password: 'BicePass!' };

// Estado de slots: false = libre, true = ocupado
const slots = { 1: false, 2: false, 3: false };

// Mapa para seguimiento de respuestas a @beneficios
const waitingForBenefitNumber = new Map();

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
    executablePath: puppeteer.executablePath()
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
  console.log(`[DEBUG] Mensaje entrante de ${msg.from}: "${text}"`);
  let m;

  // — 1) Comando @beneficios
  if (text.startsWith('@beneficios')) {
    console.log('[DEBUG] Se activó comando @beneficios');
    let options = 'Selecciona una opción (responde con el número):\n\n';
    benefits.forEach((b, i) => options += `${i}. ${b.title}\n`);
    await msg.reply(options);
    waitingForBenefitNumber.set(msg.from, true);
    return;
  }
  // — Respuesta numérica a @beneficios
  if (!isNaN(text) && waitingForBenefitNumber.get(msg.from)) {
    console.log('[DEBUG] Respuesta numérica tras @beneficios:', text);
    const idx = parseInt(text, 10);
    waitingForBenefitNumber.delete(msg.from);
    if (idx < 0 || idx >= benefits.length) {
      return msg.reply(`❌ Opción inválida. Escribe un número entre 0 y ${benefits.length - 1}.`);
    }
    const b = benefits[idx];
    return msg.reply(`*${b.title}*\n\n${b.content}\n\n🔗 Más info: ${b.link}`);
  }

  // — 2) Asignar cotizador: @cotizador1|2|3
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

  // — 3) Liberar cotizador: @cotizador1off|2off|3off
  if (m = text.match(/^@cotizador([123])off$/)) {
    const n = +m[1];
    if (slots[n]) {
      slots[n] = false;
      return msg.reply(`✅ Cotizador ${n} liberado.`);
    } else {
      return msg.reply(`⚠️ El cotizador ${n} ya estaba libre.`);
    }
  }

  // — 4) @turnos
  if (text.startsWith('@turnos')) {
    console.log('[DEBUG] Se activó comando @turnos');
    const resp = 
      '*Información sobre Turnos*\n\n' +
      '• La toma de turnos se realiza los SÁBADO a las 18:00 hrs 🇨🇱\n' +
      '• Cada ejecutivo debe tomar 4 turnos en días distintos\n' +
      '• Revisar horario con tu coordinador\n' +
      '• Los leads se trabajan el día de carga\n\n' +
      'Link para turnos: https://1drv.ms/x/s!AjucDJ3soG62hJh0vkRRsYyH0sDOzw?e=uet2cJ';
    return msg.reply(resp);
  }

  // — Si ningún comando coincide, no hacemos nada
});

client.initialize();
