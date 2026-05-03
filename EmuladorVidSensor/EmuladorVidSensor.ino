#include <WiFi.h>
#include <WebSocketsServer.h>

const char *ssid = "VibSensor_Emulador";
const char *password = "12345678";

WebSocketsServer webSocket = WebSocketsServer(81);

unsigned long lastTime = 0;
const int timerDelay = 5; // 200 Hz

void setup() {
  Serial.begin(115200);
  WiFi.softAP(ssid, password);
  webSocket.begin();
  Serial.println("Emulador Avanzado Iniciado...");
}

void loop() {
  webSocket.loop(); 

  unsigned long currentTime = millis();
  
  if ((currentTime - lastTime) >= timerDelay) {
    
    float t = currentTime / 1000.0; // Segundos
    
    // --- LÓGICA DE SIMULACIÓN DE RPM (Saltos grandes) ---
    int rpmBase = 0;
    // Dividimos el tiempo en bloques de 5000ms (5 segundos). 
    // El módulo 3 (% 3) nos da un ciclo infinito de 0, 1, 2.
    int cicloRPM = (currentTime / 5000) % 3; 

    if (cicloRPM == 0) {
      rpmBase = 1000; // Nivel bajo
    } else if (cicloRPM == 1) {
      rpmBase = 1500; // Nivel medio
    } else {
      rpmBase = 2000; // Nivel alto
    }

    // Le añadimos un pequeño ruido mecánico (+/- 15 RPM)
    int rpm = rpmBase + random(-15, 16); 
    
    // --- LÓGICA DE SIMULACIÓN DE VIBRACIÓN (0 a 13) ---
    
    // 1. Onda lenta: sube y baja suavemente
    float ondaLenta = 5.0 * sin(t * 0.3) + 5.0; 
    
    // 2. Ruido mecánico constante
    float ruido = random(-10, 11) / 10.0; 
    
    // 3. Pico brusco: Ocurre cada 12 segundos y dura 2 segundos
    float pico = 0;
    if ((currentTime % 12000) < 2000) {
      pico = 3.0 * sin(((currentTime % 12000) / 2000.0) * PI);
    }
    
    // Sumamos todos los comportamientos
    float vibRMS = ondaLenta + ruido + pico;

    // Forzamos los límites (Clamping)
    if(vibRMS > 13.0) vibRMS = 13.0 - abs(ruido);
    if(vibRMS < 0.0) vibRMS = abs(ruido);

    // Ajustamos la aceleración a la proporción de la vibración actual
    float accX = (vibRMS / 2.0) * sin(t * 60) + ruido;
    float accY = (vibRMS / 2.0) * cos(t * 60) + ruido;

    // Construcción del JSON
    String json = "{";
    json += "\"timestamp\":\"" + String(currentTime) + "\",";
    json += "\"rpm\":" + String(rpm) + ",";
    json += "\"accX\":" + String(accX) + ",";
    json += "\"accY\":" + String(accY) + ",";
    json += "\"vibRMS\":" + String(vibRMS);
    json += "}";

    webSocket.broadcastTXT(json);
    
    lastTime = currentTime;
  }
}