#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <SPI.h>
#include <Wire.h>
#include <ESP8266WiFi.h>
#include <WebSocketsServer_Generic.h>


// --- Pines ---
#define TFT_CS  D8
#define TFT_RST D4
#define TFT_DC  D3
#define PIN_RPM D6

Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);
const int MPU_ADDR = 0x68;

// --- Access Point ---
const char* AP_SSID = "SensorMPU";
const char* AP_PASS = "12345678";      // mínimo 8 caracteres
const IPAddress AP_IP(192, 168, 4, 1);

WebSocketsServer wsServer(81);        // puerto 81
bool clienteConectado = false;
uint8_t clienteID = 0;

// --- RPM ---
volatile int contadorPulsos = 0;
unsigned long tiempoAnterior = 0;
int rpm = 0;

// --- Zona de gráfica ---
#define HEADER_H 45
#define FOOTER_H  4
int GRAF_TOP, GRAF_BOT, GRAF_H, GRAF_W, GRAF_MID;
int xGraf = 0;
int yAnt  = -1;

// --- Filtro pasa-alto ---
const float ALPHA = 0.95;
float filtX = 0, filtY = 0;
float prevX = 0, prevY = 0;

float ESCALA_G = 0.3;

const float THR_GOOD  = 0.05;
const float THR_SAT   = 0.15;
const float THR_UNSAT = 0.30;

// --- Timing ---
#define SAMPLE_US   5000    // 200 Hz
#define PANTALLA_MS   15
#define WS_MS          5    // enviar dato por WS cada 5ms (200Hz)

unsigned long tMuestra  = 0;
unsigned long tPantalla = 0;
unsigned long tWS       = 0;
unsigned long tCalAnim  = 0;

// --- Calibración ---
#define WARMUP_MUESTRAS 150
int  warmupContador = 0;
bool calibrado      = false;
int  calPuntos      = 0;

// ─── ISR ───────────────────────────────────────────────────────────────────
ICACHE_RAM_ATTR void contarPulso() { contadorPulsos++; }

// ─── WebSocket callbacks ────────────────────────────────────────────────────
void onWebSocketEvent(uint8_t id, WStype_t tipo, uint8_t* payload, size_t length) {
  switch (tipo) {
    case WStype_CONNECTED:
      clienteConectado = true;
      clienteID        = id;
      // Enviar cabecera CSV para que Python sepa el formato
      wsServer.sendTXT(id, "HEADER:ts_ms,rpm,accX,accY,filtX,filtY,vib_rms");
      actualizarIconoWifi(true);
      break;

    case WStype_DISCONNECTED:
      clienteConectado = false;
      actualizarIconoWifi(false);
      break;

    default:
      break;
  }
}

// ─── Helpers pantalla ───────────────────────────────────────────────────────
void calcDimensiones() {
  GRAF_TOP = HEADER_H;
  GRAF_BOT = tft.height() - FOOTER_H - 1;
  GRAF_H   = GRAF_BOT - GRAF_TOP;
  GRAF_W   = tft.width();
  GRAF_MID = GRAF_TOP + GRAF_H / 2;
}

uint16_t colorISO(float v) {
  v = abs(v);
  if (v < THR_GOOD)  return ST77XX_GREEN;
  if (v < THR_SAT)   return 0xFFE0;
  if (v < THR_UNSAT) return 0xFD20;
  return ST77XX_RED;
}

// Icono WiFi pequeño en esquina superior derecha
void actualizarIconoWifi(bool conectado) {
  uint16_t col = conectado ? ST77XX_GREEN : 0x4208;
  tft.fillRect(tft.width() - 8, 36, 7, 7, col);
}

void pantallaCalibrado() {
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextSize(1);
  tft.setTextColor(0xFFE0);
  tft.setCursor(10, 30); tft.print("Inicializando");
  tft.setCursor(10, 42); tft.print("sensor...");
  tft.setTextColor(0x7BEF);
  tft.setCursor(10, 60); tft.print("No mover");
  tft.setCursor(10, 72); tft.print("el dispositivo");

  // Info del AP
  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(2, 95);  tft.print("AP: VibSensor");
  tft.setCursor(2, 107); tft.print("IP: 192.168.4.1");
  tft.setCursor(2, 119); tft.print("Puerto WS: 81");

  // Barra de progreso
  tft.drawRect(10, 135, 108, 10, 0x4208);
}

void actualizarProgreso(int cuenta, int total) {
  int ancho = map(cuenta, 0, total, 0, 106);
  tft.fillRect(11, 136, ancho, 8, 0xFFE0);

  unsigned long ahora = millis();
  if (ahora - tCalAnim > 300) {
    tCalAnim = ahora;
    calPuntos = (calPuntos + 1) % 4;
    tft.fillRect(10, 42, 118, 10, ST77XX_BLACK);
    tft.setCursor(10, 42);
    tft.setTextColor(0x7BEF);
    tft.print("sensor");
    for (int i = 0; i < calPuntos; i++) tft.print(".");
  }
}

void dibujarPlantilla() {
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextSize(1);

  tft.setTextColor(0x7BEF);
  tft.setCursor(2, 2);  tft.print("RPM:");
  tft.setCursor(2, 14); tft.print("VIB:");
  tft.setCursor(2, 26); tft.print("ISO:");
  tft.setCursor(2, 36); tft.print("RMS XY");

  // Icono wifi (gris = sin cliente)
  actualizarIconoWifi(clienteConectado);

  tft.drawFastHLine(0, HEADER_H - 1, GRAF_W, 0x4208);
  tft.drawFastHLine(0, GRAF_MID,     GRAF_W, 0x2104);

  for (int x = 0; x < GRAF_W; x += 6) {
    tft.drawPixel(x, GRAF_MID - GRAF_H / 4, 0x18C3);
    tft.drawPixel(x, GRAF_MID + GRAF_H / 4, 0x18C3);
  }

  xGraf = 0;
  yAnt  = -1;
}

void actualizarHeader(int r, float vib, uint16_t col) {
  tft.fillRect(30, 2,  50, 9, ST77XX_BLACK);
  tft.setCursor(30, 2);
  tft.setTextColor(ST77XX_CYAN);
  tft.print(r);

  tft.fillRect(30, 14, 96, 9, ST77XX_BLACK);
  tft.setCursor(30, 14);
  tft.setTextColor(col);
  tft.print(vib, 4); tft.print("g");

  tft.fillRect(30, 26, 96, 9, ST77XX_BLACK);
  tft.setCursor(30, 26);
  tft.setTextColor(col);
  if      (vib < THR_GOOD)  tft.print("BUENO");
  else if (vib < THR_SAT)   tft.print("SATISF.");
  else if (vib < THR_UNSAT) tft.print("INSATISF.");
  else                       tft.print("PELIGRO");

  tft.fillRect(tft.width() - 20, 2, 18, 18, col);
}

// ─── Setup ─────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Wire.begin(D2, D1);
  Wire.setClock(400000);

  tft.initR(INITR_BLACKTAB);
  tft.setRotation(3);
  calcDimensiones();

  // MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); Wire.write(0);
  Wire.endTransmission(true);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C); Wire.write(0x00);
  Wire.endTransmission(true);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1A); Wire.write(0x03);
  Wire.endTransmission(true);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x19); Wire.write(0x00);
  Wire.endTransmission(true);

  // Access Point
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_IP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(AP_SSID, AP_PASS);

  // WebSocket
  wsServer.begin();
  wsServer.onEvent(onWebSocketEvent);

  pinMode(PIN_RPM, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_RPM), contarPulso, FALLING);

  pantallaCalibrado();

  tMuestra  = micros();
  tPantalla = millis();
  tCalAnim  = millis();
  tWS       = millis();
}

// ─── Loop ──────────────────────────────────────────────────────────────────
void loop() {
  // WebSocket debe hacer polling siempre
  wsServer.loop();

  unsigned long ahoraMicros = micros();
  unsigned long ahoraMillis = millis();

  if (ahoraMicros - tMuestra < SAMPLE_US) return;
  tMuestra = ahoraMicros;

  // RPM
  if (ahoraMillis - tiempoAnterior >= 1000) {
    noInterrupts();
    rpm = contadorPulsos * 60;
    contadorPulsos = 0;
    interrupts();
    tiempoAnterior = ahoraMillis;
  }

  // Leer MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 4, true);
  int16_t rawX = Wire.read() << 8 | Wire.read();
  int16_t rawY = Wire.read() << 8 | Wire.read();

  float accX = rawX / 16384.0;
  float accY = rawY / 16384.0;

  // Filtro pasa-alto
  filtX = ALPHA * (filtX + accX - prevX);
  filtY = ALPHA * (filtY + accY - prevY);
  prevX = accX;
  prevY = accY;

  // Calibración
  if (!calibrado) {
    warmupContador++;
    if (ahoraMillis - tPantalla >= 10) {
      tPantalla = ahoraMillis;
      actualizarProgreso(warmupContador, WARMUP_MUESTRAS);
    }
    if (warmupContador >= WARMUP_MUESTRAS) {
      calibrado = true;
      dibujarPlantilla();
      tPantalla = ahoraMillis;
    }
    return;
  }

  // Vibración RMS
  float vib = sqrt(filtX * filtX + filtY * filtY);
  uint16_t col = colorISO(vib);

  // Pantalla
  if (ahoraMillis - tPantalla >= PANTALLA_MS) {
    tPantalla = ahoraMillis;
    actualizarHeader(rpm, vib, col);

    float norm  = constrain(filtX / ESCALA_G, -1.0, 1.0);
    int yActual = (int)(GRAF_MID - norm * (GRAF_H / 2));
    yActual     = constrain(yActual, GRAF_TOP, GRAF_BOT);

    tft.drawFastVLine(xGraf,     GRAF_TOP, GRAF_H, ST77XX_BLACK);
    tft.drawFastVLine(xGraf + 1, GRAF_TOP, GRAF_H, ST77XX_BLACK);
    tft.drawPixel(xGraf,     GRAF_MID, 0x2104);
    tft.drawPixel(xGraf + 1, GRAF_MID, 0x2104);

    if (yAnt < 0) {
      tft.drawPixel(xGraf, yActual, col);
    } else {
      tft.drawLine(xGraf, constrain(yAnt, GRAF_TOP, GRAF_BOT),
                   xGraf + 1, yActual, col);
    }
    yAnt = yActual;
    xGraf++;
    if (xGraf >= GRAF_W - 1) { xGraf = 0; yAnt = -1; }
  }

  // Enviar por WebSocket (cada WS_MS)
  if (clienteConectado && (ahoraMillis - tWS >= WS_MS)) {
    tWS = ahoraMillis;

    // Formato CSV compacto
    char buf[80];
    snprintf(buf, sizeof(buf), "%lu,%d,%.4f,%.4f,%.4f,%.4f,%.4f",
             ahoraMillis, rpm,
             accX, accY,
             filtX, filtY,
             vib);
    wsServer.sendTXT(clienteID, buf);
  }
}