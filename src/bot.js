require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const schedule = require('node-schedule');
const { cotizadores, bicevida, saveData } = require('./data/cotizadoresData'); // Modificado
const benefits = require('./data/benefitsData');

const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

app.get('/', (req, res) => res.send('🤖 Bot en funcionamiento!'));
app.listen(port, () => console.log(`Servidor iniciado en puerto ${port}`));

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('✅ Cliente listo!');
    require('./utils/scheduler')(client);
});

client.on('message', async msg => {
    const text = msg.body.toLowerCase();
    
    // Nuevo comando para obtener ID del grupo
    if(text.includes('@groupid')) {
        const chat = await msg.getChat();
        msg.reply(`🔑 ID del grupo: ${chat.id._serialized}`);
        return;
    }
    
    if(text.includes('@cotizador')) {
        handleCotizadores(msg);
    }
    
    if(text.includes('@beneficios')) {
        handleBenefits(msg);
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
            saveData(); // Persistencia al liberar
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
    saveData(); // Persistencia al asignar
    
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

// Lógica para beneficios
function handleBenefits(msg) {
    const options = `Selecciona una opción:\n\n` +
        `1. Beneficios BANMEDICA 🏥\n` +
        `2. Beneficios CONSALUD 🏥\n` +
        // ... agregar otras opciones
        `6. Beneficios VIDA TRES 🏥`;
    
    msg.reply(options);
}

// Función para turnos
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