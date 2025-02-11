const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'cotizadoresStorage.json');

let cotizadores = [];

try {
    const rawData = fs.readFileSync(dataPath);
    cotizadores = JSON.parse(rawData);
} catch (e) {
    console.error('Error al cargar datos:', e); // Mostrar error en la consola
    // Inicializar si no existe
    cotizadores = [
        { id: 1, user: 'cam.reyesmora@gmail.com', password: 'cotizador1', available: true, assignedTo: null },
        { id: 2, user: 'naranjo.paula.ps@gmail.com', password: 'cotizador2', available: true, assignedTo: null },
        { id: 3, user: 'freyes.mora@gmail.com', password: 'cotizador3', available: true, assignedTo: null }
    ];
    saveData();
}

function saveData() {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(cotizadores, null, 2));
        console.log('Datos guardados correctamente.'); // Mensaje de confirmación
    } catch (error) {
        console.error('Error al guardar datos:', error); // Mostrar error en la consola
    }
}

module.exports = {
    cotizadores,
    bicevida: {
        user: 'fernanda.lange',
        password: 'Bice.2020'
    },
    saveData
};