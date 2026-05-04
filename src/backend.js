const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const { saveVibrationsBatch, getHistoricalData, initDatabase, exportCSVStream } = require('./database');

const app = express();
const PORT = 3000;
const WS_SERVER_PORT = 8080;
const ESP_WS_URL = 'ws://192.168.4.1:81';

// Utilidad para limpiar el formato de fecha del frontend y que coincida con SQLite
const formatSqliteDate = (dateStr) => {
    if (!dateStr) return null;
    // Reemplaza la 'T' del input HTML por un espacio
    let formatted = dateStr.replace('T', ' ');
    // Si no tiene segundos (longitud típica de 16 caracteres: YYYY-MM-DD HH:MM), los añadimos
    if (formatted.length === 16) {
        formatted += ':00';
    }
    return formatted;
};

// Endpoint para datos históricos
app.get('/api/historico', (req, res) => {
    const inicio = formatSqliteDate(req.query.inicio);
    const fin = formatSqliteDate(req.query.fin);
    let data;

    try {
        if (inicio && fin) {
            data = getHistoricalData(inicio, fin);
        } else {
            const limit = 2000;
            data = getHistoricalData(null, null, limit);
        }
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al consultar la base de datos' });
    }
});

// Ruta para exportar datos a CSV
app.get('/api/exportar', (req, res) => {
    const inicio = formatSqliteDate(req.query.inicio);
    const fin = formatSqliteDate(req.query.fin);
    try {
        // Delegamos la escritura del CSV directamente a database.js
        exportCSVStream(inicio, fin, res);
    } catch (err) {
        console.error("[Backend] Error exportando CSV:", err);
        if (!res.headersSent) {
            res.status(500).send("Error interno generando el archivo CSV");
        }
    }
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Servidor WebSocket para el Frontend
const wss = new WebSocket.Server({ port: WS_SERVER_PORT });

function broadcastToClients(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Buffer para acumular datos y evitar saturación de disco
let dataBuffer = [];

// Conexión WebSocket al ESP8266
const connectToESP = () => {
    const ws = new WebSocket(ESP_WS_URL);

    ws.on('open', () => {
        console.log(`[ESP8266] Conectado exitosamente en ${ESP_WS_URL}`);
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // 1. Guardar en buffer para SQLite
            dataBuffer.push(data);
            
            // 2. Broadcast al Frontend en tiempo real
            broadcastToClients(data);
            
        } catch (err) {
            console.error('[WebSocket] Error parseando mensaje:', message.toString());
        }
    });

    ws.on('error', (error) => {
        console.error('[WebSocket] Error de conexión:', error.message);
    });

    ws.on('close', () => {
        console.log('[WebSocket] Conexión cerrada. Reintentando en 5 segundos...');
        setTimeout(connectToESP, 5000);
    });
};

// Iniciar conexión con el sensor
connectToESP();

// Lógica de Persistencia por Lotes (Batch Insert) cada 200ms
setInterval(() => {
    if (dataBuffer.length > 0) {
        const batchToSave = [...dataBuffer];
        dataBuffer = []; // Limpiar buffer inmediatamente
        
        try {
            saveVibrationsBatch(batchToSave);
            // console.log(`[DB] Guardados ${batchToSave.length} registros.`);
        } catch (err) {
            console.error('[DB] Error en inserción masiva:', err);
        }
    }
}, 200);

// Initialize the database
initDatabase().catch(err => {
    console.error("Failed to initialize database:", err);
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(` Servidor de Monitoreo Motor AC Listo`);
    console.log(` Interfaz web: http://localhost:${PORT}`);
    console.log(` Base de Datos: datos_motor.sqlite`);
    console.log(`=================================================\n`);
});
