// Modifica src/data/cotizadoresData.js
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'cotizadoresStorage.json');

let cotizadores = [];

// Cargar datos al iniciar
try {
    const rawData = fs.readFileSync(dataPath);
    cotizadores = JSON.parse(rawData);
} catch (e) {
    // Inicializar si no existe
    cotizadores = [
        { id: 1, user: 'cam.reyesmora@gmail.com', password: 'cotizador1', available: true, assignedTo: null },
        { id: 2, user: 'naranjo.paula.ps@gmail.com', password: 'cotizador2', available: true, assignedTo: null },
        { id: 3, user: 'freyes.mora@gmail.com', password: 'cotizador3', available: true, assignedTo: null }
    ];
    saveData();
}

function saveData() {
    fs.writeFileSync(dataPath, JSON.stringify(cotizadores, null, 2));
}

module.exports = {
    cotizadores,
    bicevida: {
        user: 'fernanda.lange',
        password: 'Bice.2020'
    },
    saveData
};