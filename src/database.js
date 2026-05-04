const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'datos_motor.sqlite');
const db = new Database(dbPath);

// Activar modo WAL para permitir lecturas y escrituras simultáneas sin bloqueos
db.pragma('journal_mode = WAL');

// ==============================================================
// 1. INICIALIZACIÓN SÍNCRONA DIRECTA
// Se ejecuta al instante. Garantiza que la tabla existe ANTES
// de que preparemos cualquier sentencia SQL.
// ==============================================================
db.exec(`
    CREATE TABLE IF NOT EXISTS mediciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
        rpm INTEGER,
        accX REAL,
        accY REAL,
        vibRMS REAL
    );
`);
console.log("[DB] Tabla 'mediciones' verificada/creada correctamente.");

// ==============================================================
// 2. PREPARACIÓN DE SENTENCIAS
// Ahora es seguro prepararlas porque la tabla existe sí o sí.
// ==============================================================
const insertStmt = db.prepare(`
  INSERT INTO mediciones (rpm, accX, accY, vibRMS)
  VALUES (?, ?, ?, ?)
`);

// ==============================================================
// 3. FUNCIONES DE EXPORTACIÓN
// ==============================================================

/**
 * Inserta un lote de datos en una sola transacción para optimizar el I/O de disco.
 * @param {Array} dataBatch - Array de objetos con los datos del motor
 */
const saveVibrationsBatch = db.transaction((dataBatch) => {
  for (const data of dataBatch) {
    insertStmt.run(
      data.rpm || 0,
      data.accX || 0,
      data.accY || 0,
      data.vibRMS || 0
    );
  }
});

/**
 * Obtiene los registros de la base de datos con filtros opcionales y decimación automática.
 * Se implementa downsampling si el volumen de datos supera los 2000 registros para proteger la RAM del cliente.
 * @param {string} inicio - Fecha de inicio para el filtro.
 * @param {string} fin - Fecha de fin para el filtro.
 * @param {number} limit - Cantidad de registros a recuperar.
 */
const getHistoricalData = (inicio, fin, limit) => {
    let whereClause = "";
    let params = [];

    if (inicio && fin) {
        whereClause = " WHERE timestamp BETWEEN ? AND ?";
        params = [inicio, fin];
    }

    // 1. Conteo rápido para decidir si aplicamos decimación
    const countQuery = `SELECT COUNT(*) as count FROM mediciones ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params);
    const totalCount = countResult ? countResult.count : 0;

    // El número real de puntos a procesar es el menor entre el total y el límite solicitado
    const effectiveCount = limit ? Math.min(totalCount, limit) : totalCount;

    if (effectiveCount <= 2000) {
        // CASO A: Pocos datos, retornamos todo tal cual (respetando filtros y limite)
        let query = `
            SELECT timestamp, rpm, accX, accY, vibRMS
            FROM mediciones
            ${whereClause}
            ORDER BY timestamp DESC
        `;
        if (limit) {
            query += " LIMIT ?";
            return db.prepare(query).all(...params, limit).reverse();
        }
        return db.prepare(query).all(...params).reverse();
    } else {
        // CASO B: Decimación (Downsampling)
        // Agrupamos en ~2000 cubos calculando promedios para señales y MAX para vibración (RMS)
        const decimationQuery = `
            WITH base_data AS (
                SELECT timestamp, rpm, accX, accY, vibRMS
                FROM mediciones
                ${whereClause}
                ORDER BY timestamp DESC
                ${limit ? "LIMIT ?" : ""}
            )
            SELECT 
                MIN(timestamp) as timestamp,
                AVG(rpm) as rpm,
                AVG(accX) as accX,
                AVG(accY) as accY,
                MAX(vibRMS) as vibRMS
            FROM (
                SELECT *, NTILE(2000) OVER (ORDER BY timestamp ASC) as bucket
                FROM base_data
            )
            GROUP BY bucket
            ORDER BY timestamp ASC
        `;
        
        const finalParams = limit ? [...params, limit] : params;
        return db.prepare(decimationQuery).all(...finalParams);
    }
};

/**
 * Exporta datos a CSV usando iteradores de better-sqlite3 (streaming)
 * Escribe directamente en el objeto Response HTTP para no saturar la RAM.
 */
const exportCSVStream = (inicio, fin, res) => {
    let query = "SELECT timestamp, rpm, accX, accY, vibRMS FROM mediciones ORDER BY timestamp ASC";
    let params = [];

    if (inicio && fin) {
        query = "SELECT timestamp, rpm, accX, accY, vibRMS FROM mediciones WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC";
        params = [inicio, fin];
    }

    const stmt = db.prepare(query);

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Telemetria_Motor_Completa.csv"');
    
    // Escribir cabecera con todos los nombres de columnas
    res.write('timestamp,rpm,accel_x,accel_y,vibracion_rms\n');

    let count = 0;
    for (const row of stmt.iterate(...params)) {
        // Escribir todas las columnas en cada fila
        res.write(`${row.timestamp},${row.rpm},${row.accX},${row.accY},${row.vibRMS}\n`);
        count++;
    }

    res.end();
    console.log(`[DB] Exportación completa finalizada. Filas procesadas: ${count}`);
};

/**
 * Mantenemos la función initDatabase para no romper el backend.js
 * si es que este intenta llamarla en su arranque.
 */
const initDatabase = async () => {
    // Ya está inicializada arriba de forma síncrona, así que solo resolvemos
    return Promise.resolve(true);
};

module.exports = {
  saveVibrationsBatch,
  getHistoricalData,
  initDatabase,
  exportCSVStream
};