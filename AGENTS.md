# 🤖 Project Context: VibSensor (Vibration & RPM Monitor)

Sistema de monitoreo de condición para motores de corriente alterna (AC) con visualización en tiempo real y análisis histórico, optimizado para alta frecuencia de muestreo.

## 🛠 Stack Tecnológico Actualizado

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
- **Renderizado:** Desacoplado. Gráficas a 60 FPS via `requestAnimationFrame`.
- **UI Update:** Throttling estricto a 2 Hz (500ms) para lecturas numéricas y gauges para ahorro de CPU.

## 📋 Estado Actual del Proyecto

### ✅ Completado (Hitos Alcanzados)

1.  **Dashboard Vivo (Fase 1-3 + Mejoras)**
    - Sistema de 3 estados de conexión con lógica de "Watchdog" para detectar desconexión real de la ESP.
    - Reintento de conexión silencioso (sin parpadeo visual de UI).
    - Gráfica `uplotVivo` con labels técnicos corregidos ("Muestras").
    - Gauge dinámico ISO 2372 con cambio de color por umbrales.

2.  **Persistencia y API (Fase 4)**
    - Base de datos SQLite optimizada para inserciones masivas.
    - Endpoint `/api/historico` funcional con filtros de tiempo.

3.  **Análisis Histórico (Fase 5)**
    - Reproductor (Playback) con aceleración (x1 a x10).
    - Slider de navegación temporal vinculado a los buffers de uPlot.
    - Sincronización de pestañas (Pause automático al cambiar a Vivo).

### ⏳ Pendiente (Cola de Trabajo)

1.  **Prioridad 1: Decimación (Downsampling) en Backend:** - Implementar lógica en el servidor para promediar puntos cuando el rango de fechas solicitado sea muy amplio (evitar que el navegador colapse con 100,000+ puntos).
2.  **Análisis ISO 2372 Visual:** - Agregar bandas de color (Overlays) permanentes en el fondo de las gráficas uPlot para identificar zonas A, B, C y D de vibración.
3.  **Exportación:**
    - Botón para descargar el rango actual del histórico en formato CSV.
4.  **Optimización de Memoria (Frontend):** - Implementar un límite de memoria para el buffer de la gráfica en vivo para evitar fugas tras horas de uso continuo.
5.  **Empaquetado:** - Evaluación de Tauri para generar un ejecutable `.exe` ligero.

## 🎯 Reglas Críticas para Desarrollo

1.  **Manipulación de Gráficas:**
    - NUNCA destruir la instancia de uPlot al cambiar de pestaña; usar `.setSize()` para ajustar el layout al volver a mostrar el contenedor.
    - El eje X siempre debe etiquetarse como "Muestras" a menos que se implemente el cálculo de tiempo real basado en frecuencia de muestreo.

2.  **Gestión de Estados:**
    - `currentMode` rige si los datos del WebSocket se guardan en el buffer de la gráfica o se ignoran (cortafuegos de CPU).

3.  **Git Workflow:**
    - Realizar commits descriptivos (`feat:`, `fix:`, `refactor:`) antes de iniciar cambios en la arquitectura de datos.

## 📁 Estructura de Archivos

- `src/backend.js`: Lógica de servidor y orquestación de WebSockets.
- `src/database.js`: Operaciones CRUD y optimización de transacciones.
- `public/app.js`: Cerebro del frontend (uPlot, lógica de conexión y playback).
- `public/index.html`: Layout basado en TailwindCSS.
- `AGENTS.md`: Contexto y hoja de ruta (este archivo).