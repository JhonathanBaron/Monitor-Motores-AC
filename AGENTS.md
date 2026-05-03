# 🤖 Project Context: VibSensor (Vibration & RPM Monitor)

Sistema de monitoreo de condición para motores de corriente alterna (AC) con visualización en tiempo real y análisis histórico.

## 🛠 Stack Tecnológico

| Capa | Tecnología |
|------|-------------|
| **Backend** | Node.js (Express) + `ws` (WebSocket) + `better-sqlite3` |
| **Frontend** | HTML5, TailwindCSS, uPlot.js (gráficos de alto rendimiento) |
| **Hardware** | ESP8266/ESP32 (sensor emulado: Access Point `VibSensor_Emulador`) |

## 📡 Conectividad

- **Puerto 3000:** Servidor HTTP (Interfaz web)
- **Puerto 8080:** WebSocket → Frontend (datos en tiempo real)
- **WebSocket ESP:** `ws://192.168.4.1:81` (desde ESP8266)
- **Base de datos:** `datos_motor.sqlite` (persistencia SQLite)

## 📊 Arquitectura de Datos

- **Frecuencia de adquisición:** ~200 Hz (del sensor)
- **Buffer de insertion:** Lotes cada 200ms (~40 registros por lote)
- **Gráficas:** 60 FPS (desacoplado de la frecuencia de recepción)
- **UI gauges:** 2 Hz (500ms) para texto/barras

## 📋 Estado Actual del Proyecto

### ✅ Completado

1. **Monitoreo en Vivo (Phase 1-3)**
   - WebSocket servidor en puerto 8080
   - Gráfica uPlot con ventana deslizante (1000 puntos)
   - Indicador RPM con barra de progreso
   - Gauge ISO 2372 con umbrales de severidad (verde/amarillo/naranja/rojo)
   - Estado de conexión en tiempo real
   - Mejora del indicador visual de conexión en tiempo real (estilo LED con colores verde/rojo y brillo dinámico usando Tailwind)

2. **Base de Datos (Phase 4)**
   - Schema SQLite con columna `timestamp`
   - Inserción por lotes (transaction) para performance
   - Endpoint `/api/historico` con filtros de fecha y límite

3. **Interfaz de Análisis Histórico (Phase 5)**
   - Panel de filtros de fecha (inicio/fin)
   - Gráfica uPlot histórica (instancia separada)
   - Controles de reproducción: Play/Pause
   - Slider de navegación temporal
   - Selector de velocidad (x1, x2, x5, x10)
   - Contador de puntos reproducidos

### ⏳ Pendiente

- **Prioridad Alta:** Decimación (Downsampling) en backend: Agrupar/promediar datos en consultas de rangos grandes (horas/días) para evitar saturar la memoria RAM del navegador frontend debido a la alta frecuencia de adquisición (200Hz)
- Exportación de datos a CSV
- Análisis ISO 2372 visual en gráficas (overlays de zonas)
- Empaquetado multiplataforma (Tauri para Windows, Capacitor para Android)
- Selección de directorio de almacenamiento

## 🎯 Reglas Críticas para Desarrollo

1. **Gráficas uPlot:**
   - Contenedores con `height` FIJA (400px) en CSS
   - Instancias separadas: `uplotVivo` (verde) y `uplotHistorico` (azul)
   - Usar `requestAnimationFrame` para renderizado

2. **Performance:**
   - Buffer de datos desacoplado del renderizado
   - UI text/gauge a 2Hz, charts a 60FPS
   - Batch inserts a SQLite cada 200ms

3. **Sincronización:**
   - `currentMode` ('vivo' | 'historico') controla flujo de datos
   - Pause playback al cambiar a pestaña Vivo

## 📁 Archivos Clave

| Archivo | Propósito |
|---------|------------|
| `src/backend.js` | Servidor Express + WebSocket + API |
| `src/database.js` | Schema SQLite + queries + batch insert |
| `public/app.js` | Lógica frontend, uPlot, playback |
| `public/index.html` | UI con TailwindCSS |
| `public/style.css` | Estilos específicos de gráficas |

## 🚀 Próximos Pasos

1. Implementar la Decimación (Downsampling) en el endpoint /api/historico.

2. Implementar visualización de zonas de alerta ISO 2372 (overlays) en las gráficas de uPlot.

3. Exportación de datos a CSV.