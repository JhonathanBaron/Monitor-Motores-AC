// Elementos del DOM
const tabVivo = document.getElementById('tab-vivo');
const tabHistorico = document.getElementById('tab-historico');
const rpmValor = document.getElementById('rpm-valor');
const rpmBar = document.getElementById('rpm-bar');
const isoValor = document.getElementById('iso-valor');
const gaugeIndicator = document.getElementById('gauge-indicator');
const connectionDot = document.getElementById('connection-dot');
const connectionStatus = document.getElementById('connection-status');
const graficaContenedor = document.getElementById('grafica-principal');

// Configuración de uPlot
let uplot;
const windowSize = 1000; // 5 segundos a 200Hz

// Inicialización estricta de datos [ [X], [Y] ]
let chartData = [
    Array.from({length: windowSize}, (_, i) => i),
    new Array(windowSize).fill(0)
];

function initChart() {
    // Eliminar contenido previo (como el placeholder)
    graficaContenedor.innerHTML = '';

    const rect = graficaContenedor.getBoundingClientRect();
    
    const opts = {
        title: "",
        width: rect.width - 40,
        height: rect.height - 40,
        scales: {
            x: { time: false },
            y: { range: [0, 20] } 
        },
        series: [
            {},
            {
                label: "Vibración",
                stroke: "#10b981", // Verde neón
                width: 2,
                points: { show: false }
            }
        ],
        axes: [
            { grid: { stroke: "#374151", width: 1 }, stroke: "#9ca3af" },
            { grid: { stroke: "#374151", width: 1 }, stroke: "#9ca3af" }
        ],
        cursor: { show: false }
    };

    uplot = new uPlot(opts, chartData, graficaContenedor);
    
    // Resize observer para manejar cambios de tamaño de ventana manualmente
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            uplot.setSize({
                width: width - 40,
                height: height - 40
            });
        }
    });
    
    resizeObserver.observe(graficaContenedor);
}

// Buffers de datos
let incomingDataBuffer = []; // Para la gráfica (raw)
let uiBuffer = { rpm: [], vib: [] }; // Para el suavizado visual (DOM)

// Conexión WebSocket al Backend (Puerto 8080)
function connectWS() {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => updateConnectionStatus(true);
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Acumular datos para el suavizado visual
            uiBuffer.rpm.push(data.rpm || 0);
            uiBuffer.vib.push(data.vibRMS || 0);
            
            // Empujar al buffer para la gráfica (raw)
            incomingDataBuffer.push(data.vibRMS || data.accX || 0);
        } catch (e) {
            console.error("Error procesando dato:", e);
        }
    };

    ws.onclose = () => {
        updateConnectionStatus(false);
        setTimeout(connectWS, 2000);
    };
}

// Función de Suavizado Visual (Promedio Móvil) para el DOM
function updateUIDom() {
    if (uiBuffer.rpm.length > 0) {
        // Calcular promedios
        const avgRPM = uiBuffer.rpm.reduce((a, b) => a + b, 0) / uiBuffer.rpm.length;
        const avgVib = uiBuffer.vib.reduce((a, b) => a + b, 0) / uiBuffer.vib.length;

        // Actualizar elementos HTML
        updateRPM(avgRPM);
        updateISO(avgVib);

        // Limpiar buffers secundarios
        uiBuffer.rpm = [];
        uiBuffer.vib = [];
    }
}

// Actualizar el DOM cada 500ms (2 veces por segundo) para legibilidad
setInterval(updateUIDom, 500);

// Ciclo de Renderizado a 60 FPS (requestAnimationFrame) para la Gráfica
function renderLoop() {
    if (incomingDataBuffer.length > 0) {
        const newPoints = [...incomingDataBuffer];
        incomingDataBuffer = [];

        const currentY = chartData[1];
        
        newPoints.forEach(val => {
            currentY.push(val);
            if (currentY.length > windowSize) {
                currentY.shift();
            }
        });

        uplot.setData(chartData);
    }
    requestAnimationFrame(renderLoop);
}

// Auxiliares de UI
function updateRPM(rpm) {
    // Redondeo sin decimales para RPM
    const val = Math.round(rpm);
    rpmValor.textContent = val;
    const percentage = Math.min((val / 4000) * 100, 100); 
    rpmBar.style.width = `${percentage}%`;
}

function updateISO(vibRMS) {
    // Redondeo a 2 decimales para vibRMS
    const val = vibRMS.toFixed(2);
    isoValor.textContent = val;
    
    const maxValue = 20;
    const percentage = Math.min(vibRMS / maxValue, 1);
    const offset = 314 * (1 - percentage); 
    gaugeIndicator.style.strokeDashoffset = offset;
    
    // Colores según ISO 2372
    if (vibRMS < 4.5) gaugeIndicator.style.stroke = '#22c55e';
    else if (vibRMS < 7.1) gaugeIndicator.style.stroke = '#f59e0b';
    else if (vibRMS < 11.2) gaugeIndicator.style.stroke = '#f97316';
    else gaugeIndicator.style.stroke = '#ef4444';
}

function updateConnectionStatus(connected) {
    if (connected) {
        connectionDot.className = 'w-3.5 h-3.5 rounded-full connection-connected ring-2 ring-dashboard-card';
        connectionStatus.textContent = 'ESP8266 Conectado';
    } else {
        connectionDot.className = 'w-3.5 h-3.5 rounded-full connection-disconnected ring-2 ring-dashboard-card';
        connectionStatus.textContent = 'Buscando sensor...';
    }
}

// Inicialización
initChart();
connectWS();
renderLoop();

// Tabs
tabVivo.onclick = () => console.log("Vivo");
tabHistorico.onclick = () => alert("Módulo de Históricos próximamente");
