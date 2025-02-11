require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const axios = require('axios');
const schedule = require('node-schedule');
const { cotizadores, bicevida, saveData } = require('./data/cotizadoresData');
const benefits = require('./data/benefitsData');

const app = express();
const port = process.env.PORT || 3000;

// Mapa para rastrear estado de los usuarios
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

// Configuración del servidor web
app.get('/', (req, res) => res.send(' Bot en funcionamiento!'));
app.listen(port, () => console.log(`Servidor iniciado en puerto ${port}`));

// Manejo de QR
client.on('qr', qr => {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
    console.log(' Escanea este QR:', qrImageUrl);
});

client.on('ready', () => {
    console.log('✅ Cliente listo!');
    require('./utils/scheduler')(client);
});

client.on('auth_failure', () => {
    console.log('⚠️ Error de autenticación');
});

client.on('message', async msg => {
    const text = msg.body.toLowerCase().trim();

    // Comando IA
    if (text.startsWith('@ia ')) {
        handleIACommand(msg);
        return;
    }

    // Comando para obtener ID del grupo
    if (text.includes('@groupid')) {
        const chat = await msg.getChat();
        msg.reply(` ID del grupo: ${chat.id._serialized}`);
        return;
    }

    // Manejo de beneficios
    if (text.includes('@beneficios')) {
        handleBenefits(msg);
        waitingForBenefitNumber.set(msg.from, true);
        return;
    }

    // Manejo de selección numérica
    if (!isNaN(text) && waitingForBenefitNumber.get(msg.from)) {
        handleBenefitSelection(msg, text);
        return;
    }

    // Otros comandos
    if (text.includes('@cotizador')) {
        handleCotizadores(msg);
    }

    if (text.includes('@turnos')) {
        sendTurnosMessage(msg);
    }

    // Comando para liberar todos los cotizadores
    if (text === '@liberarcotizador') {
        cotizadores.forEach(cotizador => {
            cotizador.available = true;
            cotizador.assignedTo = null;
        });
        saveData();
        msg.reply('¡Todos los cotizadores han sido liberados!');
        return;
    }
});

// Función para manejar comandos de IA
async function handleIACommand(msg) {
    if(aiCooldown.has(msg.from)) {
        msg.reply('⌛ Por favor espera 20 segundos entre consultas.');
        return;
    }
    
    aiCooldown.add(msg.from);
    setTimeout(() => aiCooldown.delete(msg.from), 20000);
    
    const pregunta = msg.body.slice(4).trim();
    
    try {
        const respuesta = await consultarOpenAI(pregunta);
        msg.reply(`🤖 *Respuesta IA:*\n\n${respuesta}`);
    } catch (error) {
        console.error('Error OpenAI:', error.response?.data || error.message);
        msg.reply('⚠️ Error al procesar tu consulta. Intenta más tarde.');
    }
}

// Función para consultar OpenAI
async function consultarOpenAI(pregunta) {
    const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: "gpt-3.5-turbo",
            messages: [{
                role: "user",
                content: `Responde en español de forma clara, concisa y precisa (máximo 150 palabras). Contexto: seguros de salud en Chile. Pregunta: ${pregunta}`
            }],
            temperature: 0.3,
            max_tokens: 200
        },
        {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );

    let respuesta = response.data.choices[0].message.content;
    return respuesta.length > 1500 ? respuesta.substring(0, 1497) + '...' : respuesta;
}

// Función para manejar selección de beneficios
function handleBenefitSelection(msg, text) {
    const number = parseInt(text);
    
    if(number < 1 || number > 6) {
        msg.reply('❌ Opción inválida. Por favor responde con un número del 1 al 6.');
        waitingForBenefitNumber.delete(msg.from);
        return;
    }
    
    const benefit = benefits[number];
    if(benefit) {
        msg.reply(`*${benefit.title}*\n\n${benefit.content}`);
    }
    waitingForBenefitNumber.delete(msg.from);
}

function handleCotizadores(msg) {
    const user = msg.from;

    if (msg.body.includes('@cotizadoroff')) {
        const cotizador = cotizadores.find(c => c.assignedTo === user);
        if (cotizador) {
            cotizador.available = true;
            cotizador.assignedTo = null;
            saveData();
            msg.reply(`✅ Cotizador ${cotizador.id} liberado correctamente!`);
        }
        return;
    }

    const available = cotizadores.filter(c => c.available);
    if (available.length === 0) {
        return msg.reply('⚠️ Lo siento, no hay cotizadores disponibles en este momento.');
    }

    const assigned = available[0];
    assigned.available = false;
    assigned.assignedTo = user;
    saveData();

    let mensaje = `*Cotizadores Mejora Tu Salud* \n\n`;

    mensaje += `*Cotizador asignado: ${assigned.id}* ✅\n`;
    mensaje += `⭐ Usuario: ${assigned.user}\n`;
    mensaje += `⭐ Contraseña: ${assigned.password}\n\n`;
    mensaje += `Usa @cotizadoroff para liberarlo! \n\n`;

    mensaje += `---------------------------------------\n\n`;
    mensaje += `*Estado de Cotizadores:* \n\n`;

    cotizadores.forEach(cotizador => {
        mensaje += `${cotizador.available ? '❌' : '✅'} *Cotizador ${cotizador.id}:* `;
        mensaje += `${cotizador.user} / ${cotizador.password}\n`; // Mostrar ID fija
    });

    mensaje += `\n---------------------------------------\n\n`;
    mensaje += `*Cotizador BICEVIDA:* \n`;
    mensaje += `- Usuario: ${bicevida.user}\n`;
    mensaje += `- Contraseña: ${bicevida.password}`;

    msg.reply(mensaje);

}

function handleBenefits(msg) {
    const options = `Selecciona una opción (responde con el número):\n\n` +
        `1. BANMEDICA 🏥\n` +
        `2. CONSALUD 🏥\n` +
        `3. ESENCIAL 🏥\n` +
        `4. NUEVA MAS VIDA 🏥\n` +
        `5. COLMENA 🏥\n` +
        `6. VIDA TRES 🏥`;
    
    msg.reply(options);
}

function sendTurnosMessage(msg) {
    const response = `📅 *Información sobre Turnos* 📅\n\n` +
        `• La toma de turnos se realiza los SÁBADO a las 18:00 hrs 🇨🇱\n` +
        `• Cada ejecutivo debe tomar 4 turnos en días distintos\n` +
        `• Revisar horario con tu coordinador\n` +
        `• Los leads se trabajan el día de carga 📝\n\n` +
        `Link para turnos: https://1drv.ms/x/s!AjucDJ3soG62hJh0vkRRsYyH0sDOzw?e=uet2cJ`;
    
    msg.reply(response);
}

function handleCotizadores(msg) {
    const user = msg.from;

    if (msg.body.includes('@cotizadoroff')) {
        const cotizador = cotizadores.find(c => c.assignedTo === user);
        if (cotizador) {
            cotizador.available = true;
            cotizador.assignedTo = null;
            saveData();
            msg.reply(`✅ Cotizador ${cotizador.id} liberado correctamente!`);
        }
        return;
    }

    const available = cotizadores.filter(c => c.available);
    if (available.length === 0) {
        return msg.reply('⚠️ Lo siento, no hay cotizadores disponibles en este momento.');
    }

    const assigned = available[0];
    assigned.available = false;
    assigned.assignedTo = user;
    saveData();

    let mensaje = `*Cotizadores Mejora Tu Salud* \n\n`;

    mensaje += `*Cotizador asignado: ${assigned.id}* ✅\n`;
    mensaje += `⭐ Usuario: ${assigned.user}\n`;
    mensaje += `⭐ Contraseña: ${assigned.password}\n\n`;
    mensaje += `Usa @cotizadoroff para liberarlo! \n\n`;

    mensaje += `---------------------------------------\n\n`;
    mensaje += `*Estado de Cotizadores:* \n\n`;

    cotizadores.forEach(cotizador => {
        mensaje += `${cotizador.available ? '✅' : '❌'} *Cotizador ${cotizador.id}:* `;
        mensaje += `${cotizador.assignedTo || 'Disponible'} / ${cotizador.password || ''}\n`;
    });

    mensaje += `\n---------------------------------------\n\n`;
    mensaje += `*Cotizador BICEVIDA:* \n`;
    mensaje += `- Usuario: ${bicevida.user}\n`;
    mensaje += `- Contraseña: ${bicevida.password}`;

    msg.reply(mensaje);

}


client.initialize();
