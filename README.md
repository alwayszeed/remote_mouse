# Remote Mouse & Keyboard (PC, Laptop, Mac)

Turns any mobile device (phone or tablet) into a wireless remote mouse, keyboard, and Apple Magic Trackpad with multi-touch gestures, gyro steering, voice input, and specialty remote panels.

Works over **Bluetooth Connection** (Bluetooth PAN / Tethering & Web Bluetooth) and **Wi-Fi / Hotspot**.

---

## Capabilities

### Mouse & Trackpad
- **Cursor Control:** Precision relative cursor tracking with acceleration curves.
- **Gyro Mouse:** Move cursor by physically tilting and steering your phone (using gyroscope and accelerometer).
- **Left-Handed Mode:** Swaps primary/secondary click buttons and tap gestures.
- **Apple Magic Trackpad Simulation:**
  - 1-finger move: Move pointer.
  - 1-finger tap: Left click.
  - 1-finger double tap & drag: Drag and drop (click & hold).
  - 2-finger pan: Smooth vertical and horizontal scrolling.
  - 2-finger tap: Right click.
  - Pinch in/out: Zoom in / Zoom out.
  - 3-finger swipe up: Task View (Windows) / Mission Control (Mac).
  - 3-finger swipe down: Show Desktop.
  - 3-finger swipe left/right: App Switcher (Alt+Tab / Cmd+Tab).
  - Right scroll strip: One-thumb fast scrolling.

### Keyboard & Voice Input
- **Type in Any Language:** Universal text buffer with native IME support (Arabic, Chinese, Japanese, Cyrillic, emojis, etc.) sent directly to the active PC window.
- **Voice Dictation:** Built-in microphone button converts speech to text and types it into the computer in real time.
- **Adaptive Layouts:** Toggle between **PC (Windows)** (`Ctrl`, `Win`, `Alt`) and **Mac (macOS)** (`Control`, `Cmd`, `Option`).
- **System Shortcuts:** Select All, Copy, Cut, Paste, Undo, Save, Find, Screenshot, Esc, F1–F12, Arrow keys, Del, Backspace, Enter, PgUp, PgDn, Home, End.

### Specialty Panels (Reorderable)
1. **Media Remote:** Control YouTube, Netflix, Disney+, Apple TV+, VLC, Spotify with Play/Pause, Next/Prev, Volume +/-, Mute, Skip -5s/+5s, Fullscreen, Subtitles, Theater Mode.
2. **Web Remote:** Chrome, Firefox, Opera, Edge navigation (New Tab, Close Tab, Reopen Tab, Next/Prev Tab, Back, Forward, Reload, URL Bar, Bookmark, Zoom).
3. **App Switcher:** Alt+Tab / Cmd+Tab cycling, Task View, Show Desktop, Close App, Quick launchers (Browser, File Explorer, Terminal, Calculator, Task Manager).
4. **Power Options:** Remotely Lock Screen, Sleep, Restart, or Shut Down (with safe confirmation dialogs).
5. **Clipboard Sync:** Push mobile text to PC clipboard (with optional auto-paste) and fetch PC clipboard text to mobile.

### Other Features
- **Hardware Volume Buttons:** Use your phone's physical volume rocker to adjust PC master volume.
- **Password Security:** Protect remote access with a custom password.
- **Panel Reordering:** Move specialty panels up and down; preferences save automatically.
- **Custom Wallpapers:** Choose from Dark Slate, Cyber Neon, Midnight Navy, Obsidian Green, or upload your own wallpaper image.

---

## Quick Start

### 1. Start the Desktop Server

#### Windows
Double-click `server/start_server.bat` or run:
```bash
python server/server.py
```

#### macOS / Linux
Run:
```bash
chmod +x server/start_server.sh
./server/start_server.sh
```

To secure with a password:
```bash
python server/server.py --password yoursecretpassword
```

### 2. Connect Your Mobile Device

#### Option A: Over Bluetooth Connection
1. Pair your phone with your computer in Windows / Mac Bluetooth settings.
2. On your phone, turn on **Bluetooth Tethering** (Settings > Mobile Network / Hotspot > Bluetooth Tethering).
3. Open the browser on your phone and enter the Bluetooth IP displayed in the terminal (e.g. `http://192.168.44.1:8000` or `http://192.168.137.1:8000`).

#### Option B: Over Local Wi-Fi or Mobile Hotspot
1. Connect your phone to the same Wi-Fi network or PC Mobile Hotspot.
2. Open the URL displayed in the terminal (e.g. `http://192.168.1.10:8000`).

### 3. Install as Native App (PWA)
- On iOS (Safari): Tap the **Share** button > **Add to Home Screen**.
- On Android (Chrome): Tap the **Three Dots Menu** > **Add to Home screen** / **Install app**.
- Launches full-screen without address bar, with app icon on your home screen.

---

## Directory Structure

```
Project Mouse Remote/
├── client/                     # Mobile Web App & PWA
│   ├── index.html              # Main UI (Trackpad, Keyboard, Panels, Settings)
│   ├── style.css               # Apple dark glassmorphism & themes
│   ├── app.js                  # Multi-touch gestures, gyro, voice, websocket
│   ├── manifest.json           # PWA standalone manifest
│   ├── sw.js                   # Service Worker cache
│   └── icons/
│       └── icon.svg            # Remote mouse app icon
├── server/                     # Desktop Control Server
│   ├── server.py               # HTTP + WebSocket input controller
│   ├── test_server.py          # Automated verification test suite
│   ├── requirements.txt        # Server dependencies
│   ├── start_server.bat        # Windows launcher
│   └── start_server.sh         # Mac/Linux launcher
├── capacitor.config.json       # Mobile native wrapper configuration
├── package.json                # Capacitor build scripts
└── README.md                   # Documentation
```

---

## Android APK Installation

The compiled, ready-to-install Android APK is generated at:
`D:\Github\Project Mouse Remote\RemoteMouse.apk`

### How to Install on Phone:
1. Transfer `RemoteMouse.apk` to your phone via USB cable, Google Drive, WhatsApp, or local share.
2. Tap the file on your Android phone to install (allow "Install from Unknown Sources" if prompted).
3. Open **Remote Mouse** on your phone.
4. Set PC IP address or connect over Bluetooth PAN / Wi-Fi.

### How to Rebuild APK:
Double-click `build_apk.bat` or run:
```bash
./build_apk.bat
```
