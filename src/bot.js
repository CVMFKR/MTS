require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const schedule = require('node-schedule');
const { cotizadores, bicevida, saveData } = require('./data/cotizadoresData');
const benefits = require('./data/benefitsData');
console.log("Contenido de benefits:", benefits);

const app = express();
const port = process.env.PORT || 3000;

const waitingForBenefitNumber = new Map();
const aiCooldown = new Set();

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

app.get('/', (req, res) => res.send('Bot en funcionamiento!'));
app.listen(port, () => console.log(`Servidor iniciado en puerto ${port}`));

client.on('qr', qr => {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
    console.log('Escanea este QR:', qrImageUrl);
});

client.on('ready', () => {
    console.log('✅ Cliente listo!');
    require('./utils/scheduler')(client);
});

client.on('auth_failure', () => {
    console.log('⚠️ Error de autenticación');
});

async function handleBenefits(msg) {
    // Construye la lista de opciones
    let options = "Selecciona una opción (responde con el número):\n\n";
    benefits.forEach((b, idx) => {
      options += `${idx}. ${b.title}\n`;
    });
    // Envía la lista
    await msg.reply(options);
  }
  
  function handleBenefitSelection(msg, text) {
    const idx = parseInt(text, 10);
    // Valida rango
    if (isNaN(idx) || idx < 0 || idx >= benefits.length) {
      waitingForBenefitNumber.delete(msg.from);
      return msg.reply(`❌ Opción inválida. Escribe un número entre 0 y ${benefits.length - 1}.`);
    }
    // Muestra el detalle
    const b = benefits[idx];
    msg.reply(`*${b.title}*\n\n${b.content}`);
    waitingForBenefitNumber.delete(msg.from);
  }

  client.on('message', async msg => {
    const text = msg.body.toLowerCase().trim();
    console.log("Mensaje recibido:", msg.body);
  
    // ── 1) Comando @beneficios ──
    if (text.startsWith('@beneficios')) {
      console.log("Comando @beneficios detectado");
      await handleBenefits(msg);
      waitingForBenefitNumber.set(msg.from, true);
      return;
    }
  
    // ── 2) Respuesta numérica tras @beneficios ──
    if (!isNaN(text) && waitingForBenefitNumber.get(msg.from)) {
      handleBenefitSelection(msg, text);
      return;
    }
  
    // ── 3) Comandos de cotizadores ──
    //    Cualquier texto que empiece con "@cotizador" entra al handler
    if (text.startsWith('@cotizador')) {
      handleCotizadores(msg);
      return;
    }
  
    // ── 4) Comando @turnos ──
    if (text.startsWith('@turnos')) {
      sendTurnosMessage(msg);
      return;
    }
  
    // ── 5) Liberar todos los cotizadores ──
    if (text === '@liberarcotizador') {
      cotizadores.forEach(c => {
        c.available = true;
        c.assignedTo = null;
      });
      saveData();
      msg.reply('¡Todos los cotizadores han sido liberados!');
      return;
    }
  
    // (Si más adelante añades comandos, agrégalos aquí con el mismo patrón)
  });
  

async function handleIACommand(msg) {
    if (aiCooldown.has(msg.from)) {
        msg.reply('⌛ Por favor espera 20 segundos entre consultas.');
        return;
    }

    aiCooldown.add(msg.from);
    setTimeout(() => aiCooldown.delete(msg.from), 20000);

    const pregunta = msg.body.slice(4).trim();

    try {
        const respuesta = await consultarDeepSeek(pregunta);
        msg.reply(` *Respuesta IA:*\n\n${respuesta}`);
    } catch (error) {
        console.error('Error DeepSeek:', error);
        msg.reply('⚠️ Error al procesar tu consulta. Intenta más tarde.');
    }
}

async function consultarDeepSeek(pregunta) {
    const response = await fetch('https://api.deepseek.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: pregunta }],
            max_tokens: 300,
            temperature: 0.3,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Error en la solicitud a DeepSeek: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    let respuesta = data.choices[0].message.content;

    return respuesta.length > 1500 ? respuesta.substring(0, 1497) + '...' : respuesta;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const userCotizadorMap = new Map();

function handleCotizadores(msg) {
  const user = msg.from;
  const text = msg.body.trim().toLowerCase();

  // ——— OFF con número “@cotizadoroff 2” o “@cotizador2off”
  const offMatch = text.match(/^@cotizador(?:off\s*([1-3])|([1-3])off)$/);
  if (offMatch) {
    const id = parseInt(offMatch[1] ?? offMatch[2], 10);
    const cot = cotizadores.find(c => c.id === id);
    if (!cot) {
      return msg.reply(`❌ No existe el cotizador ${id}.`);
    }
    if (cot.available) {
      return msg.reply(`⚠️ El cotizador ${id} ya está libre.`);
    }
    // liberamos
    cot.available = true;
    cot.assignedTo = null;
    // quitamos de cualquier userCotizadorMap que lo tuviera
    for (const [u, assignedId] of userCotizadorMap.entries()) {
      if (assignedId === id) userCotizadorMap.delete(u);
    }
    saveData();
    return msg.reply(`✅ Cotizador ${id} liberado por *${user}*.`);
  }

  // ——— OFF genérico “@cotizadoroff”
  if (text === '@cotizadoroff') {
    const currentId = userCotizadorMap.get(user);
    if (!currentId) {
      return msg.reply('❌ No tienes ningún cotizador asignado.');
    }
    const cot = cotizadores.find(c => c.id === currentId);
    cot.available = true;
    cot.assignedTo = null;
    userCotizadorMap.delete(user);
    saveData();
    return msg.reply(`✅ Cotizador ${currentId} liberado.`);
  }

  // ——— ON específico “@cotizador2”
  const onMatch = text.match(/^@cotizador([1-3])$/);
  if (onMatch) {
    const id = parseInt(onMatch[1], 10);

    if (userCotizadorMap.has(user)) {
      return msg.reply(`❌ Ya tienes asignado el cotizador ${userCotizadorMap.get(user)}. Usa @cotizadoroff para liberarlo primero.`);
    }
    const cot = cotizadores.find(c => c.id === id);
    if (!cot) {
      return msg.reply(`❌ No existe el cotizador ${id}.`);
    }
    if (!cot.available) {
      return msg.reply(`⚠️ El cotizador ${id} ya está en uso.`);
    }
    // asignar
    cot.available = false;
    cot.assignedTo = user;
    userCotizadorMap.set(user, id);
    saveData();

    // enviamos el mensaje detallado
    return sendCotizadorMessage(msg, cot);
  }

  // ——— ON genérico “@cotizador”
  if (text === '@cotizador') {
    if (userCotizadorMap.has(user)) {
      return msg.reply(`❌ Ya tienes asignado el cotizador ${userCotizadorMap.get(user)}. Usa @cotizadoroff para liberarlo.`);
    }
    const free = cotizadores.find(c => c.available);
    if (!free) {
      return msg.reply('⚠️ Lo siento, no hay cotizadores disponibles ahora.');
    }
    free.available = false;
    free.assignedTo = user;
    userCotizadorMap.set(user, free.id);
    saveData();

    return sendCotizadorMessage(msg, free);
  }

  // No es comando de cotizadores: salir
}

function sendCotizadorMessage(msg, assigned) {
  let mensaje = `*Cotizadores Mejora Tu Salud*\n\n`;
  mensaje += `Webpage: https://vendor.tu7.cl/account\n\n`;
  mensaje += `*Cotizador asignado:* ${assigned.id} ✅\n\n`;
  mensaje += `⭐ Usuario: ${assigned.user}\n`;
  mensaje += `⭐ Contraseña: ${assigned.password}\n\n`;
  mensaje += `Usa @cotizadoroff para liberarlo!\n\n`;
  mensaje += `---------------------------------------\n\n`;
  mensaje += `*Estado de Cotizadores:*\n\n`;
  cotizadores.forEach(c => {
    mensaje += `${c.available ? '✅' : '❌'} Cotizador ${c.id}: ${c.available ? 'Disponible' : 'Ocupado'}\n`;
  });
  mensaje += `\n---------------------------------------\n\n`;
  mensaje += `*Cotizador BICEVIDA:*\n`;
  mensaje += `- Usuario: ${bicevida.user}\n`;
  mensaje += `- Contraseña: ${bicevida.password}`;

  msg.reply(mensaje);
}

function sendTurnosMessage(msg) {
    const response = ` *Información sobre Turnos* \n\n` +
        `• La toma de turnos se realiza los SÁBADO a las 18:00 hrs 🇨🇱
        • Cada ejecutivo debe tomar 4 turnos en días distintos
        • Revisar horario con tu coordinador
        • Los leads se trabajan el día de carga 

        Link para turnos: https://1drv.ms/x/s!AjucDJ3soG62hJh0vkRRsYyH0sDOzw?e=uet2cJ`;

    msg.reply(response);
}

client.initialize();