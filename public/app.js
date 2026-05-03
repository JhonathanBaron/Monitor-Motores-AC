// ==========================================
// ELEMENTOS DEL DOM
// ==========================================
const tabVivo = document.getElementById('tab-vivo');
const tabHistorico = document.getElementById('tab-historico');
const containerVivo = document.getElementById('container-vivo');
const containerHistorico = document.getElementById('container-historico');

const rpmValor = document.getElementById('rpm-valor');
const rpmBar = document.getElementById('rpm-bar');
const isoValor = document.getElementById('iso-valor');
const gaugeIndicator = document.getElementById('gauge-indicator');
const connectionDot = document.getElementById('connection-dot');
const connectionStatus = document.getElementById('connection-status');

// Gráficas
const graficaContenedorVivo = document.getElementById('grafica-principal');
const graficaContenedorHistorico = document.getElementById('grafica-historico');

// Controles Histórico
const btnLoadData = document.getElementById('btn-load-data'); // Botón "Cargar"
const btnPlay = document.getElementById('btn-play');
const btnPause = document.getElementById('btn-pause');
const playbackSlider = document.getElementById('playback-slider');
const selectSpeed = document.getElementById('select-speed');
const playbackInfo = document.getElementById('playback-info');

// Inputs de Fecha
const inputFechaInicio = document.getElementById('fecha-inicio');
const inputFechaFin = document.getElementById('fecha-fin');

// ==========================================
// CONFIGURACIÓN UPLOT Y ESTADO GLOBAL
// ==========================================
const windowSize = 1000; 
let currentMode = 'vivo'; // 'vivo' o 'historico'

// Variables de Instancias
window.uplotVivo = null;
window.uplotHistorico = null;

// Buffers de Datos
let chartDataVivo = [
    Array.from({length: windowSize}, (_, i) => i),
    new Array(windowSize).fill(0)
];

let historicalDataRaw = [];
let chartDataHistorico = [[], []];

// ==========================================
// INICIALIZACIÓN DE GRÁFICAS
// ==========================================

function initVivoChart() {
    graficaContenedorVivo.innerHTML = '';
    const rectVivo = graficaContenedorVivo.getBoundingClientRect();
    
    const optsVivo = {
        width: rectVivo.width || 800,
        height: rectVivo.height || 400,
        scales: { x: { time: false }, y: { range: [0, 20] } },
        series: [{}, { stroke: "#10b981", width: 2, points: { show: false } }],
        axes: [
            { 
                grid: { stroke: "#374151" }, 
                stroke: "#9ca3af", 
                label: "Muestras", // <-- CORREGIDO A MUESTRAS
                labelSize: 30 
            }, 
            { 
                grid: { stroke: "#374151" }, 
                stroke: "#9ca3af", 
                label: "Amplitud (mm/s)", 
                labelSize: 40 
            }
        ],
        cursor: { show: false }
    };
    window.uplotVivo = new uPlot(optsVivo, chartDataVivo, graficaContenedorVivo);
}

function initHistoricoChart() {
    graficaContenedorHistorico.innerHTML = '';
    const rectHist = graficaContenedorHistorico.getBoundingClientRect();
    
    const optsHist = {
        width: rectHist.width || 800,
        height: rectHist.height || 400,
        scales: { x: { time: false }, y: { range: [0, 20] } },
        series: [{}, { stroke: "#3b82f6", width: 1, points: { show: false }, fill: "rgba(59, 130, 246, 0.1)" }],
        axes: [
            { 
                grid: { stroke: "#374151" }, 
                stroke: "#9ca3af", 
                label: "Muestras", // <-- CORREGIDO A MUESTRAS
                labelSize: 30 
            }, 
            { 
                grid: { stroke: "#374151" }, 
                stroke: "#9ca3af", 
                label: "Amplitud (mm/s)", 
                labelSize: 40 
            }
        ],
        cursor: { show: true }
    };
    // Inicializar vacía
    chartDataHistorico = [
        Array.from({length: windowSize}, (_, i) => i),
        new Array(windowSize).fill(0)
    ];
    window.uplotHistorico = new uPlot(optsHist, chartDataHistorico, graficaContenedorHistorico);
}

// ==========================================
// ESTADO DE CONEXIÓN UI 
// ==========================================

function actualizarEstadoConexion(estado) {
    connectionDot.className = 'w-3.5 h-3.5 rounded-full ring-2 ring-dashboard-card transition-all duration-300';
    
    if (estado === 'inactivo') {
        connectionStatus.textContent = 'Inactivo';
        connectionStatus.className = 'text-sm font-medium text-red-500';
        connectionDot.classList.add('bg-red-500');
    } else if (estado === 'conectando') {
        connectionStatus.textContent = 'Conectando...';
        connectionStatus.className = 'text-sm font-medium text-yellow-500';
        connectionDot.classList.add('bg-yellow-500', 'animate-pulse');
    } else if (estado === 'conectado') {
        connectionStatus.textContent = 'Conectado';
        connectionStatus.className = 'text-sm font-medium text-green-500';
        connectionDot.classList.add('bg-green-500');
    }
}

// ==========================================
// LÓGICA DE WEBSOCKET Y WATCHDOG
// ==========================================

let incomingDataBuffer = [];
let uiBuffer = { rpm: [], vib: [] };
let isFirstConnectionAttempt = true;
let espWatchdog = null; // Temporizador para verificar si llegan datos de la ESP

function connectWS() {
    // Solo mostramos "Conectando" si es el primer intento, para evitar parpadeo infinito
    if (isFirstConnectionAttempt) {
        actualizarEstadoConexion('conectando');
    }
    
    const ws = new WebSocket(`ws://${window.location.hostname}:8080`);
    
    ws.onopen = () => {
        isFirstConnectionAttempt = false;
        // Nos conectamos al backend, pero esperamos en amarillo hasta ver datos de la ESP
        actualizarEstadoConexion('conectando'); 
    };
    
    ws.onmessage = (event) => {
        if (currentMode !== 'vivo') return; 
        try {
            const data = JSON.parse(event.data);
            
            // Si llegan datos reales, la ESP está transmitiendo
            if (data.rpm !== undefined || data.vibRMS !== undefined) {
                actualizarEstadoConexion('conectado'); // Verde
                
                // Reiniciar el Watchdog
                clearTimeout(espWatchdog);
                espWatchdog = setTimeout(() => {
                    // Si pasan 2 segundos sin recibir datos nuevos, asumimos que la ESP se desconectó
                    actualizarEstadoConexion('conectando'); 
                }, 2000);

                uiBuffer.rpm.push(data.rpm || 0);
                uiBuffer.vib.push(data.vibRMS || 0);
                incomingDataBuffer.push(data.vibRMS || 0);
            }
        } catch (e) {}
    };
    
    ws.onerror = () => {
        // No actualizamos la UI aquí para evitar choque con onclose y eliminar el parpadeo
    };
    
    ws.onclose = () => { 
        clearTimeout(espWatchdog);
        actualizarEstadoConexion('inactivo'); // Rojo
        // Reintento silencioso en segundo plano cada 3 segundos
        setTimeout(connectWS, 3000); 
    };
}

// ==========================================
// LÓGICA DE PLAYBACK (MODO HISTÓRICO)
// ==========================================

let playbackIndex = 0;
let isPlaying = false;
let playbackTimer = null;

let lastUiUpdate = 0;
let uiAccRpm = 0;
let uiAccVib = 0;
let uiAccCount = 0;

async function loadHistoricalData() {
    if (!btnLoadData) return;
    btnLoadData.textContent = "Cargando...";
    
    try {
        let url = '/api/historico';
        const params = new URLSearchParams();
        
        if (inputFechaInicio && inputFechaInicio.value) params.append('inicio', inputFechaInicio.value);
        if (inputFechaFin && inputFechaFin.value) params.append('fin', inputFechaFin.value);
        
        if (params.toString()) url += `?${params.toString()}`;
        
        const res = await fetch(url);
        historicalDataRaw = await res.json();
        
        if (historicalDataRaw.length === 0) {
            alert("No hay datos en el rango seleccionado.");
            btnLoadData.textContent = "Cargar Histórico";
            return;
        }

        playbackSlider.max = historicalDataRaw.length - 1;
        playbackSlider.value = 0;
        playbackIndex = 0;
        
        chartDataHistorico = [
            Array.from({length: windowSize}, (_, i) => i),
            new Array(windowSize).fill(0)
        ];
        
        if (!window.uplotHistorico) initHistoricoChart();
        window.uplotHistorico.setData(chartDataHistorico);
        
        playbackInfo.textContent = `Puntos: 0 / ${historicalDataRaw.length}`;
        btnLoadData.textContent = "Cargar Histórico";
        alert(`Éxito: Se cargaron ${historicalDataRaw.length} registros para analizar.`);
        
    } catch (e) {
        console.error("Error cargando historial:", e);
        btnLoadData.textContent = "Error al Cargar";
        alert("Hubo un error de conexión con la base de datos.");
    }
}

// ==========================================
// CONTROL DE REPRODUCCIÓN
// ==========================================

function pausePlayback() {
    isPlaying = false;
    if (playbackTimer) {
        cancelAnimationFrame(playbackTimer);
        playbackTimer = null;
    }
    
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    if (btnPlay) btnPlay.classList.remove('hidden');
    if (btnPause) btnPause.classList.add('hidden');
}

function startPlayback() {
    if (isPlaying || historicalDataRaw.length === 0) return;
    isPlaying = true;
    
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    if (btnPlay) btnPlay.classList.add('hidden');
    if (btnPause) btnPause.classList.remove('hidden');
    
    let lastUiUpdate = performance.now();
    let uiAccumulatorRpm = 0;
    let uiAccumulatorVib = 0;
    let accumulatorCount = 0;
    
    const run = (timestamp) => {
        if (!isPlaying) return;
        
        const speed = selectSpeed ? parseInt(selectSpeed.value) : 1;
        
        for (let i = 0; i < speed; i++) {
            if (playbackIndex >= historicalDataRaw.length) {
                pausePlayback();
                return;
            }
            
            let currentData = historicalDataRaw[playbackIndex];
            const vibValue = currentData.vibRMS !== undefined ? currentData.vibRMS : (currentData.valor_vibracion || 0);
            const rpmValue = currentData.rpm || 0;
            
            chartDataHistorico[1].push(vibValue);
            if (chartDataHistorico[1].length > windowSize) {
                chartDataHistorico[1].shift();
            }
            
            uiAccumulatorRpm += rpmValue;
            uiAccumulatorVib += vibValue;
            accumulatorCount++;
            
            playbackIndex++;
        }
        
        window.uplotHistorico.setData(chartDataHistorico);
        if (playbackSlider) playbackSlider.value = playbackIndex;
        
        if (timestamp - lastUiUpdate >= 500 && accumulatorCount > 0) {
            const avgRpm = Math.round(uiAccumulatorRpm / accumulatorCount);
            const avgVib = uiAccumulatorVib / accumulatorCount;
            
            updateRPM(avgRpm);
            updateISO(avgVib);
            
            uiAccumulatorRpm = 0;
            uiAccumulatorVib = 0;
            accumulatorCount = 0;
            lastUiUpdate = timestamp;
            
            if (playbackInfo) playbackInfo.textContent = `Puntos: ${playbackIndex} / ${historicalDataRaw.length}`;
        }
        
        playbackTimer = requestAnimationFrame(run);
    };
    
    playbackTimer = requestAnimationFrame(run);
}

if (playbackSlider) {
    playbackSlider.oninput = () => {
        playbackIndex = parseInt(playbackSlider.value);
        if (playbackInfo) playbackInfo.textContent = `Puntos: ${playbackIndex} / ${historicalDataRaw.length}`;
        
        if (historicalDataRaw[playbackIndex]) {
            const data = historicalDataRaw[playbackIndex];
            const vibValue = data.vibRMS !== undefined ? data.vibRMS : (data.valor_vibracion || 0);
            updateRPM(data.rpm || 0);
            updateISO(vibValue);
            
            chartDataHistorico[1].push(vibValue);
            if (chartDataHistorico[1].length > windowSize) chartDataHistorico[1].shift();
            if (window.uplotHistorico) window.uplotHistorico.setData(chartDataHistorico);
        }
    };
}

// ==========================================
// CICLOS Y EVENTOS GENERALES
// ==========================================

function renderLoopVivo() {
    if (currentMode === 'vivo' && incomingDataBuffer.length > 0) {
        const newPoints = [...incomingDataBuffer];
        incomingDataBuffer = [];
        
        newPoints.forEach(val => {
            chartDataVivo[1].push(val);
            if (chartDataVivo[1].length > windowSize) chartDataVivo[1].shift();
        });
        
        if (window.uplotVivo) window.uplotVivo.setData(chartDataVivo);
    }
    requestAnimationFrame(renderLoopVivo);
}

setInterval(() => {
    if (currentMode === 'vivo' && uiBuffer.rpm.length > 0) {
        const avgRPM = uiBuffer.rpm.reduce((a, b) => a + b, 0) / uiBuffer.rpm.length;
        const avgVib = uiBuffer.vib.reduce((a, b) => a + b, 0) / uiBuffer.vib.length;
        updateRPM(avgRPM);
        updateISO(avgVib);
        uiBuffer.rpm = []; uiBuffer.vib = [];
    }
}, 500);

tabVivo.onclick = () => {
    currentMode = 'vivo';
    containerVivo.classList.remove('hidden');
    containerHistorico.classList.add('hidden');
    tabVivo.className = "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all bg-gradient-to-r from-accent-blue to-blue-600 text-white shadow-lg";
    tabHistorico.className = "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all text-gray-400 hover:text-white hover:bg-dashboard-card";
    pausePlayback(); 
    
    setTimeout(() => { if (window.uplotVivo) window.uplotVivo.setSize(graficaContenedorVivo.getBoundingClientRect()); }, 50);
};

tabHistorico.onclick = () => {
    currentMode = 'historico';
    containerVivo.classList.add('hidden');
    containerHistorico.classList.remove('hidden');
    tabHistorico.className = "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all bg-gradient-to-r from-accent-blue to-blue-600 text-white shadow-lg";
    tabVivo.className = "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all text-gray-400 hover:text-white hover:bg-dashboard-card";
    
    setTimeout(() => { if (window.uplotHistorico) window.uplotHistorico.setSize(graficaContenedorHistorico.getBoundingClientRect()); }, 50);
};

// ==========================================
// UTILIDADES UI
// ==========================================

function updateRPM(rpm) {
    const val = Math.round(rpm);
    rpmValor.textContent = val;
    rpmBar.style.width = `${Math.min((val / 4000) * 100, 100)}%`;
}

function updateISO(vibRMS) {
    isoValor.textContent = vibRMS.toFixed(2);
    if(gaugeIndicator) {
        gaugeIndicator.style.strokeDashoffset = 314 * (1 - Math.min(vibRMS / 20, 1));
        if (vibRMS < 4.5) gaugeIndicator.style.stroke = '#22c55e'; 
        else if (vibRMS < 7.1) gaugeIndicator.style.stroke = '#f59e0b'; 
        else if (vibRMS < 11.2) gaugeIndicator.style.stroke = '#f97316'; 
        else gaugeIndicator.style.stroke = '#ef4444'; 
    }
}

// ==========================================
// ARRANQUE DEL SISTEMA
// ==========================================

initVivoChart();
initHistoricoChart();

connectWS();
renderLoopVivo();

if (btnLoadData) btnLoadData.onclick = loadHistoricalData;
if (btnPlay) btnPlay.onclick = startPlayback;
if (btnPause) btnPause.onclick = pausePlayback;