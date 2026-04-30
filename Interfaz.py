import threading
import time
from collections import deque

import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.animation import FuncAnimation
import numpy as np
import websocket

# ─── Configuración ─────────────────────────────────────────────────────────
WS_URL      = "ws://192.168.4.1:81"
BUFFER_SIZE = 1000          
RECONECTAR  = True

# Umbrales ISO 2372
THR_GOOD    = 0.05
THR_SAT     = 0.15
THR_UNSAT   = 0.30

# ─── Buffers thread-safe ────────────────────────────────────────────────────
buf_tiempo = deque(maxlen=BUFFER_SIZE)
buf_vib    = deque(maxlen=BUFFER_SIZE)
buf_filtX  = deque(maxlen=BUFFER_SIZE)
buf_filtY  = deque(maxlen=BUFFER_SIZE)
buf_rpm    = deque(maxlen=BUFFER_SIZE)

estado_ws  = {"conectado": False, "ultimo": "Sin conexión"}
lock       = threading.Lock()

# ─── WebSocket callbacks ────────────────────────────────────────────────────
def on_message(ws, message):
    if message.startswith("HEADER:"):
        return                        

    try:
        partes = message.split(",")
        if len(partes) < 7:
            return

        ts   = int(partes[0]) / 1000.0    # ms → s
        rpm  = int(partes[1])
        filtX = float(partes[4])
        filtY = float(partes[5])
        vib   = float(partes[6])

        with lock:
            buf_tiempo.append(ts)
            buf_vib.append(vib)
            buf_filtX.append(filtX)
            buf_filtY.append(filtY)
            buf_rpm.append(rpm)

    except Exception:
        pass


def on_open(ws):
    estado_ws["conectado"] = True
    estado_ws["ultimo"]    = "Conectado"
    print("[WS] Conectado a", WS_URL)


def on_close(ws, code, msg):
    estado_ws["conectado"] = False
    estado_ws["ultimo"]    = "Desconectado"
    print("[WS] Desconectado")


def on_error(ws, error):
    estado_ws["ultimo"] = f"Error: {error}"
    print("[WS] Error:", error)


def hilo_ws():
    while RECONECTAR:
        try:
            ws = websocket.WebSocketApp(
                WS_URL,
                on_open=on_open,
                on_message=on_message,
                on_close=on_close,
                on_error=on_error,
            )
            ws.run_forever(ping_interval=10, ping_timeout=5)
        except Exception as e:
            print("[WS] Excepción:", e)
        time.sleep(2)      # esperar antes de reconectar


# ─── Figura ─────────────────────────────────────────────────────────────────
plt.style.use("dark_background")
fig = plt.figure(figsize=(12, 7), facecolor="#10120F")
fig.canvas.manager.set_window_title("VibSensor — Monitor de Vibraciones")

gs = gridspec.GridSpec(3, 3, figure=fig,
                       hspace=0.45, wspace=0.35,
                       left=0.07, right=0.97,
                       top=0.92,  bottom=0.08)

ax_vib  = fig.add_subplot(gs[0, :])   # vibración RMS (fila completa)
ax_x    = fig.add_subplot(gs[1, :])   # eje X filtrado
ax_rpm  = fig.add_subplot(gs[2, 0])   # RPM
ax_iso  = fig.add_subplot(gs[2, 1])   # indicador ISO (gauge)
ax_hist = fig.add_subplot(gs[2, 2])   # histograma de vib

# Colores
C_VIB  = "#00e5ff"
C_X    = "#76ff03"
C_Y    = "#ffea00"
C_GRID = "#1a1a1a"

for ax in [ax_vib, ax_x, ax_rpm]:
    ax.set_facecolor("#111111")
    ax.grid(True, color=C_GRID, linewidth=0.5)
    ax.tick_params(colors="#aaaaaa", labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor("#333333")

ax_iso.set_facecolor("#111111")
ax_hist.set_facecolor("#111111")

# Títulos
ax_vib.set_title("Vibración RMS (XY)", color="#cccccc", fontsize=9, pad=4)
ax_x.set_title("Señal filtrada — Eje X",  color="#cccccc", fontsize=9, pad=4)
ax_rpm.set_title("RPM",                   color="#cccccc", fontsize=9, pad=4)
ax_iso.set_title("Estado ISO 2372",       color="#cccccc", fontsize=9, pad=4)
ax_hist.set_title("Distribución VIB",     color="#cccccc", fontsize=9, pad=4)

ax_vib.set_ylabel("g", color="#aaaaaa", fontsize=8)
ax_x.set_ylabel("g",   color="#aaaaaa", fontsize=8)
ax_rpm.set_ylabel("RPM", color="#aaaaaa", fontsize=8)

# Líneas iniciales
line_vib,  = ax_vib.plot([], [], color=C_VIB,  lw=1.2, label="RMS")
line_x,    = ax_x.plot([],   [], color=C_X,    lw=1.0, label="filtX")

# Zonas ISO en ax_vib
ax_vib.axhspan(0,         THR_GOOD,  alpha=0.08, color="green")
ax_vib.axhspan(THR_GOOD,  THR_SAT,   alpha=0.08, color="yellow")
ax_vib.axhspan(THR_SAT,   THR_UNSAT, alpha=0.08, color="orange")
ax_vib.axhspan(THR_UNSAT, 1.0,       alpha=0.08, color="red")
ax_vib.set_ylim(0, 0.5)

ax_x.set_ylim(-0.4, 0.4)
ax_x.axhline(0, color="#333333", lw=0.5)

# Gauge ISO (texto grande)
txt_iso = ax_iso.text(0.5, 0.5, "---",
                      ha="center", va="center",
                      fontsize=20, fontweight="bold",
                      color="white",
                      transform=ax_iso.transAxes)
txt_vib_val = ax_iso.text(0.5, 0.2, "0.0000 g",
                           ha="center", va="center",
                           fontsize=10, color="#aaaaaa",
                           transform=ax_iso.transAxes)
ax_iso.set_xticks([]); ax_iso.set_yticks([])

# Estado conexión
txt_estado = fig.text(0.5, 0.965, "Sin conexión",
                      ha="center", fontsize=9,
                      color="#ff5555",
                      fontweight="bold")

def color_iso(v):
    if v < THR_GOOD:  return "#00e676", "BUENO"
    if v < THR_SAT:   return "#ffea00", "SATISF."
    if v < THR_UNSAT: return "#c97200", "INSATISF."
    return "#ff1744", "PELIGRO"


# ─── Animación ──────────────────────────────────────────────────────────────
def actualizar(frame):
    with lock:
        if len(buf_tiempo) < 2:
            return line_vib, line_x

        t    = np.array(buf_tiempo)
        vib  = np.array(buf_vib)
        fx   = np.array(buf_filtX)
        rpms = np.array(buf_rpm)

    # Tiempo relativo al último punto
    t_rel = t - t[-1]

    # Gráfica VIB RMS
    line_vib.set_data(t_rel, vib)
    ax_vib.set_xlim(t_rel[0], 0)

    # Gráfica eje X
    line_x.set_data(t_rel, fx)
    ax_x.set_xlim(t_rel[0], 0)

    # RPM (últimos puntos)
    ax_rpm.cla()
    ax_rpm.set_facecolor("#111111")
    ax_rpm.grid(True, color=C_GRID, linewidth=0.5)
    ax_rpm.plot(t_rel, rpms, color="#ff6d00", lw=1.2)
    ax_rpm.set_ylabel("RPM", color="#aaaaaa", fontsize=8)
    ax_rpm.set_xlim(t_rel[0], 0)
    ax_rpm.tick_params(colors="#aaaaaa", labelsize=8)
    ax_rpm.set_title("RPM", color="#cccccc", fontsize=9, pad=4)

    # Histograma
    ax_hist.cla()
    ax_hist.set_facecolor("#111111")
    ax_hist.hist(vib, bins=30, color=C_VIB, alpha=0.7, edgecolor="none")
    ax_hist.axvline(THR_GOOD,  color="green",  lw=0.8, ls="--")
    ax_hist.axvline(THR_SAT,   color="yellow", lw=0.8, ls="--")
    ax_hist.axvline(THR_UNSAT, color="orange", lw=0.8, ls="--")
    ax_hist.set_xlabel("g", color="#aaaaaa", fontsize=8)
    ax_hist.tick_params(colors="#aaaaaa", labelsize=8)
    ax_hist.set_title("Distribución VIB", color="#cccccc", fontsize=9, pad=4)

    # Gauge ISO
    v_actual = float(vib[-1])
    col, etiqueta = color_iso(v_actual)
    txt_iso.set_text(etiqueta)
    txt_iso.set_color(col)
    txt_vib_val.set_text(f"{v_actual:.4f} g")
    ax_iso.set_facecolor(col + "22")   # fondo tenue del color

    # Estado conexión
    if estado_ws["conectado"]:
        txt_estado.set_text(f"● Conectado — {WS_URL}")
        txt_estado.set_color("#00e676")
    else:
        txt_estado.set_text(f"○ {estado_ws['ultimo']} — reintentando...")
        txt_estado.set_color("#ff5555")

    return line_vib, line_x


# ─── Main ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    t = threading.Thread(target=hilo_ws, daemon=True)
    t.start()

    ani = FuncAnimation(fig, actualizar, interval=100,
                        blit=False, cache_frame_data=False)
    plt.show()