require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const puppeteer = require('puppeteer');
require('./utils/scheduler');

const benefits = require('./data/benefitsData');
console.log('⚙️ benefitsData cargados:', Array.isArray(benefits) ? benefits.length : '¡NO es un array!', 'elementos');

const baseUrl = 'https://vendor.tu7.cl/account';
const cotizadoresInfo = {
  1: { user: 'cam.reyesmora@gmail.com', password: 'cotizador1' },
  2: { user: 'naranjo.paula.ps@gmail.com', password: 'cotizador2' },
  3: { user: 'freyes.mora@gmail.com', password: 'cotizador3' },
};
const bicevida = { user: 'fernanda.lange', password: 'Bice.2020' };

const slots = { 1: false, 2: false, 3: false };
const waitingForBenefitNumber = new Map();

const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot en funcionamiento!'));
app.listen(port, () => console.log(`Servidor iniciado en puerto ${port}`));

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

  // — 1) @beneficios
  if (text.startsWith('@beneficios')) {
    console.log('[DEBUG] Se activó comando @beneficios');
    let options = 'Selecciona una opción (responde con el número):\n\n';
    benefits.forEach((b, i) => options += `${i}. ${b.title}\n`);
    try {
      await msg.reply(options);
      waitingForBenefitNumber.set(msg.from, true);
    } catch (err) {
      console.error('❌ Error al enviar opciones de beneficios:', err.message);
    }
    return;
  }

  // — 2) Número respuesta a beneficios
  if (!isNaN(text) && waitingForBenefitNumber.get(msg.from)) {
    console.log('[DEBUG] Respuesta numérica tras @beneficios:', text);
    waitingForBenefitNumber.delete(msg.from);
    const idx = parseInt(text, 10);
    const b = benefits?.[idx];
    if (!b) {
      try {
        return await msg.reply(`❌ Opción inválida. Escribe un número entre 0 y ${benefits.length - 1}.`);
      } catch (err) {
        console.error('❌ Error al enviar advertencia de índice:', err.message);
      }
    } else {
      try {
        return await msg.reply(`*${b.title}*\n\n${b.content}\n\n🔗 Más info: ${b.link}`);
      } catch (err) {
        console.error('❌ Error al enviar beneficio:', err.message);
      }
    }
    return;
  }

  // — 3) @cotizador1|2|3
  if ((m = text.match(/^@cotizador([123])$/))) {
    const n = +m[1];
    try {
      if (!slots[n]) {
        slots[n] = true;
        let reply = `*Cotizadores Mejora Tu Salud*\n\n`;
        reply += `Web: ${baseUrl}\n\n`;
        reply += `*Cotizador asignado:* ${n} ✅\n`;
        reply += `• Usuario: ${cotizadoresInfo[n].user}\n`;
        reply += `• Contraseña: ${cotizadoresInfo[n].password}\n\n`;
        reply += `*Estado de todos los cotizadores:*\n`;
        [1, 2, 3].forEach(i => {
          reply += `${slots[i] ? '❌' : '✅'} Cotizador ${i}: ${slots[i] ? 'Ocupado' : 'Disponible'}\n`;
        });
        reply += `\n*Cotizador BICEVIDA:*\n`;
        reply += `• Usuario: ${bicevida.user}\n`;
        reply += `• Contraseña: ${bicevida.password}`;
        return await msg.reply(reply);
      } else {
        return await msg.reply(`❌ El cotizador ${n} ya está ocupado.`);
      }
    } catch (err) {
      console.error('❌ Error en asignación de cotizador:', err.message);
    }
    return;
  }

  // — 4) @cotizador1off|2off|3off
  if ((m = text.match(/^@cotizador([123])off$/))) {
    const n = +m[1];
    try {
      if (slots[n]) {
        slots[n] = false;
        return await msg.reply(`✅ Cotizador ${n} liberado.`);
      } else {
        return await msg.reply(`⚠️ El cotizador ${n} ya estaba libre.`);
      }
    } catch (err) {
      console.error('❌ Error al liberar cotizador:', err.message);
    }
    return;
  }
});

client.initialize();
