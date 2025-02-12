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

client.on('message', async msg => {
    console.log("Mensaje recibido:", msg.body);
    console.log("Remitente:", msg.from);
    console.log("ID del chat:", msg.chatId);
    console.log("¿Incluye @beneficios?:", msg.body.includes('@beneficios'));
    console.log("Tipo de mensaje:", msg.type);
    console.log("Estado del chat:", await msg.getChat());

    if (msg.body === '@beneficios') { // <-- Condición estricta (===)
        console.log("Comando @beneficios detectado");
        await handleBenefits(msg); // <-- Llama a handleBenefits con await
        return;
    }

    let text = msg.body.toLowerCase().trim();
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (!isNaN(text) && waitingForBenefitNumber.get(msg.from)) {
        handleBenefitSelection(msg, text);
        return;
    }

    if (text.includes('@cotizador')) {
        handleCotizadores(msg);
    }

    if (text.includes('@turnos')) {
        sendTurnosMessage(msg);
    }

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

function handleBenefitSelection(msg, text) {
    const number = parseInt(text);

    if (number < 1 || number > benefits.length) {
        msg.reply('❌ Opción inválida. Por favor responde con un número del 1 al ' + benefits.length + '.');
        waitingForBenefitNumber.delete(msg.from);
        return;
    }

    const benefit = benefits[number - 1];
    if (benefit) {
        msg.reply(`*<span class="math-inline">\{benefit\.title\}\*\\n\\n</span>{benefit.content}`);
    }
    waitingForBenefitNumber.delete(msg.from);
}

const userCotizadorMap = new Map();

function handleCotizadores(msg) {
    const user = msg.from;

    if (msg.body.includes('@cotizadoroff')) {
        const cotizadorId = userCotizadorMap.get(user);
        if (cotizadorId) {
            const cotizador = cotizadores.find(c => c.id === cotizadorId);
            if (cotizador) {
                cotizador.available = true;
                cotizador.assignedTo = null;
                saveData();
                msg.reply(`✅ Cotizador ${cotizador.id} liberado correctamente!`);
                userCotizadorMap.delete(user);
            }
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

    userCotizadorMap.set(user, assigned.id);

    const cotizadorIndex = cotizadores.findIndex(c => c.id === assigned.id);

    if (cotizadorIndex !== -1) {
        cotizadores[cotizadorIndex].available = false;
        cotizadores[cotizadorIndex].assignedTo = user;
    }

    saveData();

    let mensaje = `*Cotizadores Mejora Tu Salud* \n\n`;
    mensaje += ` Webpage: https://vendor.tu7.cl/account\n\n`;

    mensaje += `*Cotizador asignado:* ${assigned.id} ✅\n`;

    mensaje += `⭐ Usuario: ${assigned.user}\n`;
    mensaje += `⭐ Contraseña: ${assigned.password}\n\n`;
    mensaje += `Usa @cotizadoroff para liberarlo! \n\n`;

    mensaje += `---------------------------------------\n\n`;
    mensaje += `*Estado de Cotizadores:* \n\n`;

    cotizadores.forEach(cotizador => {
        mensaje += `${cotizador.available ? '✅' : '❌'} Cotizador ${cotizador.id}: `;
        mensaje += `${cotizador.available ? 'Disponible' : 'Ocupado'}\n`;
    });

    mensaje += `\n---------------------------------------\n\n`;
    mensaje += `*Cotizador BICEVIDA:* \n`;
    mensaje += `- Usuario: ${bicevida.user}\n`;
    mensaje += `- Contraseña: ${bicevida.password}`;

    msg.reply(mensaje);
}

// Función para manejar el comando de beneficios (SIN CAMBIOS)
async function handleBenefits(msg) {
    let message = "¡Hola! Selecciona una opción (responde con el número):\n\n";

    message += benefits.map((benefit, index) => `${index + 1}. ${benefit.title.trim()}`).join('\n');

    await client.sendMessage(msg.from, { text: message });
}

function sendTurnosMessage(msg) {
    const response = ` *Información sobre Turnos* \n\n` +
        `• La toma de turnos se realiza los SÁBADO a las 18:00 hrs 🇨🇱\n` +
        `• Cada ejecutivo debe tomar 4 turnos en días distintos\n` +
        `• Revisar horario con tu coordinador\n` +
        `• Los leads se trabajan el día de carga \n\n` +
        `Link para turnos: https://1drv.ms/x/s!AjucDJ3soG62hJh0vkRRsYyH0sDOzw?e=uet2cJ`;

    msg.reply(response);
}

// Función para manejar comandos de cotizadores (REPETIDA - ELIMINAR LA DUPLICADA)
// (He dejado solo una versión de handleCotizadores, las dos versiones hacían lo mismo)


client.initialize();