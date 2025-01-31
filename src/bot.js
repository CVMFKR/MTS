require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const schedule = require('node-schedule');
const { cotizadores, bicevida, saveData } = require('./data/cotizadoresData');
const benefits = require('./data/benefitsData');

const app = express();
const port = process.env.PORT || 3000;

// Mapa para rastrear estado de los usuarios
const waitingForBenefitNumber = new Map();

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
app.get('/', (req, res) => res.send('🤖 Bot en funcionamiento!'));
app.listen(port, () => console.log(`Servidor iniciado en puerto ${port}`));

// Manejo de QR
client.on('qr', qr => {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
    console.log('🔗 Escanea este QR:', qrImageUrl);
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
    
    // Comando para obtener ID del grupo
    if(text.includes('@groupid')) {
        const chat = await msg.getChat();
        msg.reply(`🔑 ID del grupo: ${chat.id._serialized}`);
        return;
    }
    
    // Manejo de beneficios
    if(text.includes('@beneficios')) {
        handleBenefits(msg);
        waitingForBenefitNumber.set(msg.from, true);
        return;
    }
    
    // Manejo de selección numérica
    if(!isNaN(text) && waitingForBenefitNumber.get(msg.from)) {
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
        return;
    }
    
    // Otros comandos
    if(text.includes('@cotizador')) {
        handleCotizadores(msg);
    }
    
    if(text.includes('@turnos')) {
        sendTurnosMessage(msg);
    }
});

function handleCotizadores(msg) {
    const user = msg.from;
    
    if(msg.body.includes('@cotizadoroff')) {
        const cotizador = cotizadores.find(c => c.assignedTo === user);
        if(cotizador) {
            cotizador.available = true;
            cotizador.assignedTo = null;
            saveData();
            msg.reply(`✅ Cotizador ${cotizador.id} liberado correctamente!`);
        }
        return;
    }
    
    const available = cotizadores.filter(c => c.available);
    if(available.length === 0) {
        return msg.reply('⚠️ Lo siento, no hay cotizadores disponibles en este momento.');
    }
    
    const assigned = available[0];
    assigned.available = false;
    assigned.assignedTo = user;
    saveData();
    
    const response = `*Cotizadores Mejora Tu Salud* 🏥💻\n\n` +
        cotizadores.map(c => 
            `${c.id}: ${c.user} / ${c.password} ${c.available ? '✅' : '❌'}`
        ).join('\n') +
        `\n\n*Cotizador asignado:* ${assigned.id}\n` +
        `Usuario: ${assigned.user}\nContraseña: ${assigned.password}\n\n` +
        `*Cotizador BICEVIDA*\nUsuario: ${bicevida.user} - Contraseña: ${bicevida.password}\n\n` +
        `Usa @cotizadoroff para liberarlo! 😊`;
    
    msg.reply(response);
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

client.initialize();