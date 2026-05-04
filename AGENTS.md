# 🤖 Project Context: VibSensor (Vibration & RPM Monitor)

Sistema de monitoreo de condición para motores de corriente alterna (AC) con visualización en tiempo real y análisis histórico, optimizado para alta frecuencia de muestreo.

## 🛠 Stack Tecnológico

| Capa | Tecnología |
|------|-------------|
| **Backend** | Node.js (Express) + `ws` (WebSocket) + `better-sqlite3` |
| **Frontend** | HTML5, TailwindCSS, uPlot.js (Gráficos de ultra-alto rendimiento) |
| **Hardware** | ESP8266/ESP32 (Conexión vía WebSocket local) |
| **Control de Versiones** | Git (Flujo Local -> Remoto GitHub/GitLab) |

## 📡 Conectividad y Puertos

- **Puerto 3000:** Servidor HTTP (Interfaz de usuario)
- **Puerto 8080:** Canal de WebSocket para streaming de datos.
- **Lógica de Conexión:** - **Inactivo (Rojo):** Sin comunicación con el backend (Node.js).
  - **Conectando (Amarillo):** Backend activo, esperando flujo de datos real de la ESP.
  - **Conectado (Verde):** Flujo de datos activo (Watchdog activo: 2s de tolerancia).

## 📊 Arquitectura de Datos

- **Frecuencia de adquisición:** ~200 Hz (Muestreo del sensor).
- **Ejes de Gráficas:** Eje X basado en **Muestras** (Samples) para precisión técnica; Eje Y en **Amplitud (mm/s)**.
- **Renderizado:** 30 FPS throttle via `requestAnimationFrame`.
- **UI Update:** Throttling estricto a 2 Hz (500ms) para lecturas numéricas y gauges.
- **Buffer:** Float32Array con `copyWithin`/`set` para evitar fugas de memoria por GC.

## 📋 Estado Actual del Proyecto

### ✅ Completado (Hitos Alcanzados)

1.  **Dashboard Vivo**
    - Sistema de 3 estados de conexión con "Watchdog" (2s tolerancia).
    - Reintento de conexión silencioso.
    - Gráficas uPlot con etiquetas técnicas.
    - Gauge dinámico ISO 2372 con cambio de color por umbrales.

2.  **Persistencia y API**
    - SQLite con modo WAL (`db.pragma('journal_mode = WAL')`).
    - Timestamps en hora local (`datetime('now', 'localtime')`).
    - Endpoint `/api/historico` con filtros de tiempo.
    - Normalización de fechas frontend→SQLite via `formatSqliteDate()`.

3.  **Análisis Histórico**
    - Reproductor (Playback) con aceleración x1 a x10.
    - Slider de navegación temporal.
    - Sincronización de pestañas (Pause automático al cambiar a Vivo).
    - Carga silenciosa (console.log/warn/error sin alert()).

4.  **Análisis ISO 2372 Visual**
    - Bandas de color (Overlays) permanentes en fondo de gráficas uPlot.
    - Zonas: Verde (0-4.5), Amarillo (4.5-7.1), Naranja (7.1-11.2), Rojo (11.2-20).

5.  **Exportación CSV**
    - Botón en UI para descargar rango seleccionado.
    - Exporta todas las columnas: timestamp, rpm, accel_x, accel_y, vibracion_rms.
    - Streaming via `stmt.iterate()` para evitar saturación de RAM.

6.  **Optimización de Memoria**
    - Float32Array con `copyWithin`/`set` en lugar de push/shift.
    - Throttle visual a 30 FPS, procesamiento de datos a máxima velocidad.

7.  **Decimación (Downsampling) en Backend**
    - Conteo rápido (`SELECT COUNT(*)`) para decidir si aplicar decimación.
    - Lógica de decisión: si ≤2000 puntos retorna sin modificar.
    - Downsampling con `NTILE(2000)` para agrupar en ~2000 buckets.
    - Usa AVG para señales (rpm, accX, accY) y MAX para vibración (vibRMS) preservando picos.

### ⏳ Pendiente (Cola de Trabajo)

1.  **Empaquetado:**
    - Evaluación de Tauri para generar ejecutable `.exe` ligero.

## 🎯 Reglas Críticas para Desarrollo

1.  **Manipulación de Gráficas:**
    - NUNCA destruir la instancia de uPlot al cambiar de pestaña; usar `.setSize()`.
    - El eje X debe etiquetarse como "Tiempo (s)" o equivalente, no "Muestras".

2.  **Gestión de Estados:**
    - `currentMode` ('vivo' o 'historico') controla si los datos del WebSocket se procesan.

3.  **Git Workflow:**
    - Commits descriptivos (`feat:`, `fix:`, `refactor:`) antes de cambios en arquitectura.

## 📁 Estructura de Archivos

- `src/backend.js`: Servidor Express, WebSocket, endpoints API con `formatSqliteDate()`.
- `src/database.js`: SQLite con WAL, streaming CSV export, decimación opcional.
- `public/app.js`: Frontend con Float32Array, 30FPS throttle, ISO zones, playback, exportación.
- `public/index.html`: UI con gauge ISO 2372 y botón Exportar CSV.
- `AGENTS.md`: Contexto y hoja de ruta (este archivo).