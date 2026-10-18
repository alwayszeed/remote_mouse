#!/usr/bin/env python3
"""
Remote Mouse Server for PC, Mac, and Linux.
Provides HTTP server for mobile client PWA and WebSocket server for real-time control.
Supports Bluetooth PAN / Tethering, Local WiFi, and optional Bluetooth RFCOMM.
"""

import os
import sys
import json
import time
import socket
import argparse
import asyncio
import threading
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

# Flush console output immediately
sys.stdout.reconfigure(line_buffering=True)

import pyautogui
import pyperclip

# Disable PyAutoGUI default delay for maximum responsiveness
pyautogui.PAUSE = 0
pyautogui.FAILSAFE = False

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")

if IS_WINDOWS:
    import ctypes
    user32 = ctypes.windll.user32

    # Windows mouse event flags
    MOUSEEVENTF_MOVE = 0x0001
    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    MOUSEEVENTF_RIGHTDOWN = 0x0008
    MOUSEEVENTF_RIGHTUP = 0x0010
    MOUSEEVENTF_MIDDLEDOWN = 0x0020
    MOUSEEVENTF_MIDDLEUP = 0x0040
    MOUSEEVENTF_WHEEL = 0x0800
    MOUSEEVENTF_HWHEEL = 0x1000


class InputController:
    """Handles cross-platform mouse, keyboard, media, power, and clipboard commands."""

    def __init__(self, is_mac_target=False):
        self.is_mac_target = is_mac_target

    def mouse_move(self, dx, dy):
        """Relative cursor movement."""
        if IS_WINDOWS:
            # Native Windows call for zero latency
            user32.mouse_event(MOUSEEVENTF_MOVE, int(dx), int(dy), 0, 0)
        else:
            pyautogui.moveRel(dx, dy)

    def mouse_click(self, button="left"):
        """Single click."""
        if IS_WINDOWS:
            if button == "right":
                user32.mouse_event(MOUSEEVENTF_RIGHTDOWN | MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
            elif button == "middle":
                user32.mouse_event(MOUSEEVENTF_MIDDLEDOWN | MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0)
            else:
                user32.mouse_event(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        else:
            pyautogui.click(button=button)

    def mouse_double_click(self, button="left"):
        """Double click."""
        self.mouse_click(button)
        time.sleep(0.05)
        self.mouse_click(button)

    def mouse_down(self, button="left"):
        """Press and hold mouse button (for drag & drop)."""
        if IS_WINDOWS:
            if button == "right":
                user32.mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
            elif button == "middle":
                user32.mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0)
            else:
                user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        else:
            pyautogui.mouseDown(button=button)

    def mouse_up(self, button="left"):
        """Release mouse button."""
        if IS_WINDOWS:
            if button == "right":
                user32.mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
            elif button == "middle":
                user32.mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0)
            else:
                user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        else:
            pyautogui.mouseUp(button=button)

    def mouse_scroll(self, dx=0, dy=0):
        """Vertical and horizontal scrolling."""
        if IS_WINDOWS:
            if dy != 0:
                user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, int(dy * 120), 0)
            if dx != 0:
                user32.mouse_event(MOUSEEVENTF_HWHEEL, 0, 0, int(dx * 120), 0)
        else:
            if dy != 0:
                pyautogui.scroll(int(dy * 10))
            if dx != 0 and hasattr(pyautogui, "hscroll"):
                pyautogui.hscroll(int(dx * 10))

    def keyboard_type(self, text):
        """Type arbitrary text, including full Unicode and non-ASCII characters."""
        # ponytail: clipboard paste handles all international alphabets cleanly. Upgrade: direct OS IME injection.
        prev = pyperclip.paste()
        try:
            pyperclip.copy(text)
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("command", "v")
            else:
                pyautogui.hotkey("ctrl", "v")
            time.sleep(0.05)
        finally:
            pyperclip.copy(prev)

    def keyboard_key(self, key):
        """Press a single key."""
        key_map = {
            "enter": "enter",
            "backspace": "backspace",
            "tab": "tab",
            "esc": "esc",
            "escape": "esc",
            "delete": "delete",
            "del": "delete",
            "up": "up",
            "down": "down",
            "left": "left",
            "right": "right",
            "home": "home",
            "end": "end",
            "pageup": "pageup",
            "pagedown": "pagedown",
            "space": "space",
        }
        mapped = key_map.get(key.lower(), key.lower())
        pyautogui.press(mapped)

    def keyboard_hotkey(self, keys):
        """Execute key combinations like ['ctrl', 'c']."""
        mapped_keys = []
        for k in keys:
            kl = k.lower()
            if kl in ("ctrl", "control"):
                mapped_keys.append("command" if (self.is_mac_target or IS_MAC) else "ctrl")
            elif kl in ("cmd", "command", "win"):
                mapped_keys.append("command" if (self.is_mac_target or IS_MAC) else "win")
            elif kl in ("alt", "option"):
                mapped_keys.append("option" if (self.is_mac_target or IS_MAC) else "alt")
            else:
                mapped_keys.append(kl)
        pyautogui.hotkey(*mapped_keys)

    def media_action(self, action):
        """Handle media player controls."""
        if action == "playpause":
            pyautogui.press("playpause")
        elif action == "next":
            pyautogui.press("nexttrack")
        elif action == "prev":
            pyautogui.press("prevtrack")
        elif action == "volup":
            pyautogui.press("volumeup")
        elif action == "voldown":
            pyautogui.press("volumedown")
        elif action == "mute":
            pyautogui.press("volumemute")
        elif action == "seek_forward":
            pyautogui.press("right")
        elif action == "seek_backward":
            pyautogui.press("left")
        elif action == "fullscreen":
            pyautogui.press("f11" if IS_WINDOWS else "f")
        elif action == "subtitles":
            pyautogui.press("c")
        elif action == "theater":
            pyautogui.press("t")

    def web_action(self, action):
        """Handle web browser navigation shortcuts."""
        mod = "command" if (self.is_mac_target or IS_MAC) else "ctrl"
        if action == "new_tab":
            pyautogui.hotkey(mod, "t")
        elif action == "close_tab":
            pyautogui.hotkey(mod, "w")
        elif action == "reopen_tab":
            pyautogui.hotkey(mod, "shift", "t")
        elif action == "next_tab":
            pyautogui.hotkey("ctrl", "tab")
        elif action == "prev_tab":
            pyautogui.hotkey("ctrl", "shift", "tab")
        elif action == "refresh":
            pyautogui.hotkey(mod, "r")
        elif action == "back":
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("command", "[")
            else:
                pyautogui.hotkey("alt", "left")
        elif action == "forward":
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("command", "]")
            else:
                pyautogui.hotkey("alt", "right")
        elif action == "address_bar":
            pyautogui.hotkey(mod, "l")
        elif action == "bookmark":
            pyautogui.hotkey(mod, "d")
        elif action == "find":
            pyautogui.hotkey(mod, "f")
        elif action == "zoom_in":
            pyautogui.hotkey(mod, "+")
        elif action == "zoom_out":
            pyautogui.hotkey(mod, "-")
        elif action == "zoom_reset":
            pyautogui.hotkey(mod, "0")

    def app_action(self, action):
        """Handle application switcher and window management."""
        if action == "switch_next":
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("command", "tab")
            else:
                pyautogui.hotkey("alt", "tab")
        elif action == "switch_prev":
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("command", "shift", "tab")
            else:
                pyautogui.hotkey("alt", "shift", "tab")
        elif action == "close_window":
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("command", "w")
            else:
                pyautogui.hotkey("alt", "f4")
        elif action == "task_view":
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("ctrl", "up")
            else:
                pyautogui.hotkey("win", "tab")
        elif action == "show_desktop":
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("command", "f3")
            else:
                pyautogui.hotkey("win", "d")
        elif action.startswith("launch:"):
            target = action.split(":", 1)[1]
            self.launch_app(target)

    def launch_app(self, app_name):
        """Launch common desktop applications."""
        if IS_WINDOWS:
            launch_map = {
                "browser": "start explorer https://www.google.com",
                "explorer": "start explorer",
                "calc": "start calc",
                "terminal": "start cmd",
                "taskmgr": "start taskmgr",
            }
            cmd = launch_map.get(app_name)
            if cmd:
                subprocess.Popen(cmd, shell=True)
        elif IS_MAC:
            launch_map = {
                "browser": "open -a Safari",
                "explorer": "open ~",
                "calc": "open -a Calculator",
                "terminal": "open -a Terminal",
                "taskmgr": "open -a 'Activity Monitor'",
            }
            cmd = launch_map.get(app_name)
            if cmd:
                subprocess.Popen(cmd, shell=True)

    def power_action(self, action):
        """Execute power state actions."""
        if action == "lock":
            if IS_WINDOWS:
                user32.LockWorkStation()
            elif IS_MAC:
                subprocess.run(["pmset", "displaysleepnow"])
            elif IS_LINUX:
                subprocess.run(["loginctl", "lock-session"])
        elif action == "sleep":
            if IS_WINDOWS:
                subprocess.run(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])
            elif IS_MAC:
                subprocess.run(["pmset", "sleepnow"])
            elif IS_LINUX:
                subprocess.run(["systemctl", "suspend"])
        elif action == "restart":
            if IS_WINDOWS:
                subprocess.run(["shutdown", "/r", "/t", "0"])
            elif IS_MAC:
                subprocess.run(["osascript", "-e", 'tell app "System Events" to restart'])
            elif IS_LINUX:
                subprocess.run(["systemctl", "reboot"])
        elif action == "shutdown":
            if IS_WINDOWS:
                subprocess.run(["shutdown", "/s", "/t", "0"])
            elif IS_MAC:
                subprocess.run(["osascript", "-e", 'tell app "System Events" to shut down'])
            elif IS_LINUX:
                subprocess.run(["systemctl", "poweroff"])

    def clipboard_get(self):
        """Read text from system clipboard."""
        try:
            return pyperclip.paste()
        except Exception:
            return ""

    def clipboard_set(self, text, auto_paste=False):
        """Write text to system clipboard, optionally auto-pasting."""
        pyperclip.copy(text)
        if auto_paste:
            time.sleep(0.05)
            if self.is_mac_target or IS_MAC:
                pyautogui.hotkey("command", "v")
            else:
                pyautogui.hotkey("ctrl", "v")


class ClientHTTPHandler(SimpleHTTPRequestHandler):
    """Serves the mobile web application files from the client directory and provides discovery API."""

    server_instance = None

    def do_GET(self):
        if self.path == "/api/discover":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            data = {
                "status": "ok",
                "app": "Remote Mouse",
                "hostname": socket.gethostname(),
                "ips": get_local_ips(),
                "ws_port": self.server_instance.ws_port if self.server_instance else 8001
            }
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress noisy HTTP asset logs in console
        pass


def get_local_ips():
    """Detect all available network interfaces including WiFi, LAN, and Bluetooth PAN."""
    ips = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        ips.append("127.0.0.1")
    return ips


class RemoteServer:
    """Manages WebSocket communication, authentication, and HTTP server."""

    def __init__(self, http_port=8000, ws_port=8001, password=None, client_dir=None):
        self.http_port = http_port
        self.ws_port = ws_port
        self.password = password
        self.client_dir = client_dir or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client")
        self.controller = InputController()
        self.authenticated_clients = set()

    def start_http_server(self):
        """Run HTTP server in background thread."""
        ClientHTTPHandler.server_instance = self
        handler = partial(ClientHTTPHandler, directory=self.client_dir)
        httpd = ThreadingHTTPServer(("0.0.0.0", self.http_port), handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        return httpd

    async def handle_ws_client(self, websocket):
        """Process incoming WebSocket packets."""
        client_id = id(websocket)
        requires_auth = bool(self.password)

        if not requires_auth:
            self.authenticated_clients.add(client_id)

        try:
            # Send initial server status
            await websocket.send(json.dumps({
                "type": "server_info",
                "platform": "mac" if IS_MAC else "windows" if IS_WINDOWS else "linux",
                "requires_auth": requires_auth,
                "authenticated": client_id in self.authenticated_clients,
            }))

            async for message in websocket:
                try:
                    data = json.loads(message)
                except Exception:
                    continue

                cmd_type = data.get("type")

                # Handle ping/latency check
                if cmd_type == "ping":
                    await websocket.send(json.dumps({"type": "pong", "time": data.get("time")}))
                    continue

                # Authentication
                if cmd_type == "auth":
                    provided_pass = data.get("password", "")
                    if provided_pass == self.password:
                        self.authenticated_clients.add(client_id)
                        await websocket.send(json.dumps({"type": "auth_result", "success": True}))
                    else:
                        await websocket.send(json.dumps({"type": "auth_result", "success": False, "error": "Invalid password"}))
                    continue

                # Enforce auth if configured
                if requires_auth and client_id not in self.authenticated_clients:
                    await websocket.send(json.dumps({"type": "error", "error": "Unauthorized"}))
                    continue

                # Clipboard synchronization
                if cmd_type == "clipboard_get":
                    clip_text = self.controller.clipboard_get()
                    await websocket.send(json.dumps({"type": "clipboard_data", "text": clip_text}))
                else:
                    self.process_command(data)

        except Exception:
            pass
        finally:
            self.authenticated_clients.discard(client_id)

    def process_command(self, data):
        """Execute command from either WebSocket or Bluetooth serial."""
        cmd_type = data.get("type")

        # Layout switch
        if cmd_type == "set_layout":
            self.controller.is_mac_target = (data.get("layout") == "mac")
            return

        # Mouse commands
        if cmd_type == "mouse_move":
            self.controller.mouse_move(data.get("dx", 0), data.get("dy", 0))
        elif cmd_type == "mouse_click":
            self.controller.mouse_click(data.get("button", "left"))
        elif cmd_type == "mouse_double_click":
            self.controller.mouse_double_click(data.get("button", "left"))
        elif cmd_type == "mouse_down":
            self.controller.mouse_down(data.get("button", "left"))
        elif cmd_type == "mouse_up":
            self.controller.mouse_up(data.get("button", "left"))
        elif cmd_type == "mouse_scroll":
            self.controller.mouse_scroll(data.get("dx", 0), data.get("dy", 0))

        # Keyboard commands
        elif cmd_type == "keyboard_type":
            self.controller.keyboard_type(data.get("text", ""))
        elif cmd_type == "keyboard_key":
            self.controller.keyboard_key(data.get("key", ""))
        elif cmd_type == "keyboard_hotkey":
            self.controller.keyboard_hotkey(data.get("keys", []))

        # Specialty controls
        elif cmd_type == "media_action":
            self.controller.media_action(data.get("action", ""))
        elif cmd_type == "web_action":
            self.controller.web_action(data.get("action", ""))
        elif cmd_type == "app_action":
            self.controller.app_action(data.get("action", ""))
        elif cmd_type == "power_action":
            self.controller.power_action(data.get("action", ""))

        # Clipboard
        elif cmd_type == "clipboard_set":
            self.controller.clipboard_set(data.get("text", ""), data.get("auto_paste", False))

    def start_bluetooth_serial_listener(self):
        """Listen on Windows Bluetooth Serial Port (COM4 / RFCOMM SPP) for direct Bluetooth mouse."""
        def bt_thread():
            try:
                import serial
                import serial.tools.list_ports
            except ImportError:
                return

            while True:
                try:
                    bt_ports = [
                        p.device for p in serial.tools.list_ports.comports()
                        if "Bluetooth" in p.description or "BTHENUM" in (p.hwid or "")
                    ]
                    # Default to COM4 if found
                    target_port = "COM4" if "COM4" in bt_ports else (bt_ports[0] if bt_ports else None)
                    if not target_port:
                        time.sleep(2)
                        continue

                    with serial.Serial(target_port, 115200, timeout=1) as ser:
                        print(f"[Bluetooth] Listening on {target_port}...", flush=True)
                        while True:
                            raw = ser.readline()
                            if not raw:
                                continue
                            line = raw.decode("utf-8", errors="ignore").strip()
                            if line:
                                try:
                                    cmd = json.loads(line)
                                    self.process_command(cmd)
                                except Exception:
                                    pass
                except Exception:
                    time.sleep(2)

        t = threading.Thread(target=bt_thread, daemon=True)
        t.start()

    def start_udp_beacon(self, udp_port=8002):
        """Broadcast auto-discovery responder for mobile apps."""
        def beacon_loop():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind(("0.0.0.0", udp_port))
                while True:
                    data, addr = sock.recvfrom(1024)
                    if b"REMOTE_MOUSE" in data:
                        resp = json.dumps({
                            "app": "Remote Mouse",
                            "hostname": socket.gethostname(),
                            "ws_port": self.ws_port,
                            "http_port": self.http_port,
                            "ips": get_local_ips()
                        }).encode("utf-8")
                        sock.sendto(resp, addr)
            except Exception:
                pass
        t = threading.Thread(target=beacon_loop, daemon=True)
        t.start()

    async def run(self):
        """Start servers and display connection banner."""
        self.start_http_server()
        self.start_udp_beacon()
        self.start_bluetooth_serial_listener()

        ips = get_local_ips()
        print("\n" + "=" * 60, flush=True)
        print("  REMOTE MOUSE SERVER - READY", flush=True)
        print("=" * 60, flush=True)
        print("How to connect your phone or tablet:", flush=True)
        print("1. OVER WI-FI / HOTSPOT:", flush=True)
        print("   In the mobile app, enter computer IP:", flush=True)
        for ip in ips:
            print(f"   -> {ip}", flush=True)
        print("\n2. DIRECT BLUETOOTH (NO TETHERING / NO PAN):", flush=True)
        print("   - Turn ON Bluetooth on your PC & Phone.", flush=True)
        print("   - Pair your phone with this PC in Windows Bluetooth settings.", flush=True)
        print("   - In the Remote Mouse mobile app, tap 'Bluetooth' to connect.", flush=True)
        print(f"\nWebSocket Port: {self.ws_port} | HTTP Port: {self.http_port}", flush=True)
        if self.password:
            print("Security: Password protection active", flush=True)
        else:
            print("Security: Open (use --password <secret> to protect)", flush=True)
        print("=" * 60 + "\n", flush=True)

        try:
            from websockets.asyncio.server import serve
        except ImportError:
            from websockets import serve

        async with serve(self.handle_ws_client, "0.0.0.0", self.ws_port):
            await asyncio.Future()


def main():
    parser = argparse.ArgumentParser(description="Remote Mouse Server")
    parser.add_argument("--http-port", type=int, default=8000, help="HTTP server port (default: 8000)")
    parser.add_argument("--ws-port", type=int, default=8001, help="WebSocket server port (default: 8001)")
    parser.add_argument("--password", type=str, default=None, help="Optional connection password")
    args = parser.parse_args()

    server = RemoteServer(
        http_port=args.http_port,
        ws_port=args.ws_port,
        password=args.password
    )

    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
