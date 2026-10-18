/**
 * Remote Mouse & Keyboard Client Logic
 * Touchpad gestures, Gyro mouse, International keyboard, Voice input,
 * Specialty panels, Bluetooth & WebSocket communication.
 */

// Detect environment
const isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : false;
const BtPlugin = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BluetoothRemote) || null;

// State Management
const state = {
  ws: null,
  connected: false,
  bluetoothConnected: false,
  connectedBtName: '',
  // If native mobile, default to detected local PC IP instead of phone's localhost
  host: localStorage.getItem('rm_host') || (isNative ? '192.168.101.73' : (window.location.hostname || '127.0.0.1')),
  port: parseInt(localStorage.getItem('rm_port') || '8001', 10),
  password: localStorage.getItem('rm_password') || '',
  osLayout: localStorage.getItem('rm_os') || 'pc', // 'pc' or 'mac'
  leftHanded: localStorage.getItem('rm_left_handed') === 'true',
  cursorSpeed: parseFloat(localStorage.getItem('rm_speed') || '1.2'),
  gyroSens: parseFloat(localStorage.getItem('rm_gyro_sens') || '1.5'),
  scrollSpeed: parseFloat(localStorage.getItem('rm_scroll_speed') || '1.0'),
  gyroActive: false,
  gyroHoldActive: false,
  gyroCalibrated: false,
  gyroBaseBeta: 0,
  gyroBaseGamma: 0,
  lastGyroBeta: null,
  lastGyroGamma: null,
  activePointers: new Map(),
  dragMode: false,
  lastTapTime: 0,
  speechRecognition: null,
  speechActive: false,
  pendingPowerAction: null,
  theme: localStorage.getItem('rm_theme') || 'theme-slate',
  customWallpaper: localStorage.getItem('rm_custom_bg') || '',
};

// DOM References
const el = {
  appContainer: document.getElementById('appContainer'),
  connDot: document.getElementById('connDot'),
  connText: document.getElementById('connText'),
  pingBadge: document.getElementById('pingBadge'),
  btnConnModal: document.getElementById('btnConnModal'),
  osBadge: document.getElementById('osBadge'),
  btnGyroToggle: document.getElementById('btnGyroToggle'),
  gyroHud: document.getElementById('gyroHud'),
  btnCalibrateGyro: document.getElementById('btnCalibrateGyro'),
  btnHoldGyro: document.getElementById('btnHoldGyro'),
  btnVoiceInput: document.getElementById('btnVoiceInput'),
  btnMicInline: document.getElementById('btnMicInline'),
  btnQuickSettings: document.getElementById('btnQuickSettings'),
  trackpadArea: document.getElementById('trackpadArea'),
  touchPointers: document.getElementById('touchPointers'),
  scrollStrip: document.getElementById('scrollStrip'),
  btnMouseLeft: document.getElementById('btnMouseLeft'),
  btnMouseMiddle: document.getElementById('btnMouseMiddle'),
  btnMouseRight: document.getElementById('btnMouseRight'),
  keyboardBuffer: document.getElementById('keyboardBuffer'),
  btnSendText: document.getElementById('btnSendText'),
  keyCtrl: document.getElementById('keyCtrl'),
  keyWin: document.getElementById('keyWin'),
  keyAlt: document.getElementById('keyAlt'),
  btnLayoutPC: document.getElementById('btnLayoutPC'),
  btnLayoutMac: document.getElementById('btnLayoutMac'),
  panelsContainer: document.getElementById('panelsContainer'),
  clipSendText: document.getElementById('clipSendText'),
  btnClipSend: document.getElementById('btnClipSend'),
  btnClipSendPaste: document.getElementById('btnClipSendPaste'),
  btnClipFetch: document.getElementById('btnClipFetch'),
  clipFetchResult: document.getElementById('clipFetchResult'),
  cfgHost: document.getElementById('cfgHost'),
  cfgWsPort: document.getElementById('cfgWsPort'),
  cfgPassword: document.getElementById('cfgPassword'),
  btnSaveConn: document.getElementById('btnSaveConn'),
  btnBluetoothScan: document.getElementById('btnBluetoothScan'),
  toggleLeftHanded: document.getElementById('toggleLeftHanded'),
  sliderSpeed: document.getElementById('sliderSpeed'),
  sliderGyroSens: document.getElementById('sliderGyroSens'),
  sliderScrollSpeed: document.getElementById('sliderScrollSpeed'),
  lblSpeed: document.getElementById('lblSpeed'),
  lblGyroSens: document.getElementById('lblGyroSens'),
  lblScrollSpeed: document.getElementById('lblScrollSpeed'),
  wallpaperUpload: document.getElementById('wallpaperUpload'),
  btnClearWallpaper: document.getElementById('btnClearWallpaper'),
  volumeAudio: document.getElementById('volumeAudio'),
  toggleVolButtons: document.getElementById('toggleVolButtons'),
  modalPower: document.getElementById('modalPower'),
  modalPowerTitle: document.getElementById('modalPowerTitle'),
  modalPowerDesc: document.getElementById('modalPowerDesc'),
  btnCancelPower: document.getElementById('btnCancelPower'),
  btnConfirmPower: document.getElementById('btnConfirmPower'),
  modalConn: document.getElementById('modalConn'),
  modalHostInput: document.getElementById('modalHostInput'),
  modalPortInput: document.getElementById('modalPortInput'),
  btnCloseConnModal: document.getElementById('btnCloseConnModal'),
  btnModalReconnect: document.getElementById('btnModalReconnect'),
  tabConnWifi: document.getElementById('tabConnWifi'),
  tabConnBt: document.getElementById('tabConnBt'),
  tabContentWifi: document.getElementById('tabContentWifi'),
  tabContentBt: document.getElementById('tabContentBt'),
  btnScanLan: document.getElementById('btnScanLan'),
  ipSuggestions: document.getElementById('ipSuggestions'),
  btnBtRefresh: document.getElementById('btnBtRefresh'),
  btDeviceList: document.getElementById('btDeviceList'),
  btActiveStatus: document.getElementById('btActiveStatus'),
  btActiveText: document.getElementById('btActiveText'),
  btnBtDisconnect: document.getElementById('btnBtDisconnect'),
  btnCloseConnModalBt: document.getElementById('btnCloseConnModalBt'),
  btnBtPairSettings: document.getElementById('btnBtPairSettings'),
};

// =========================================================
// 1. WEBSOCKET & COMMUNICATION
// =========================================================
function connectWebSocket() {
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  updateConnStatus('connecting', 'Connecting...');
  const url = `ws://${state.host}:${state.port}`;

  try {
    state.ws = new WebSocket(url);
  } catch (err) {
    updateConnStatus('disconnected', 'Failed to connect');
    return;
  }

  state.ws.onopen = () => {
    state.connected = true;
    updateConnStatus('connected', 'Connected');
    startPingInterval();

    // Send auth if password is set
    if (state.password) {
      sendPacket({ type: 'auth', password: state.password });
    }
    // Sync current OS layout
    sendPacket({ type: 'set_layout', layout: state.osLayout });
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (e) {
      // Ignored
    }
  };

  state.ws.onclose = () => {
    state.connected = false;
    updateConnStatus('disconnected', 'Disconnected');
    stopPingInterval();
    // Auto-reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };

  state.ws.onerror = () => {
    updateConnStatus('disconnected', 'Error');
  };
}

function sendPacket(obj) {
  const jsonStr = JSON.stringify(obj);

  // Send via WebSocket (Wi-Fi / Hotspot)
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(jsonStr);
  }

  // Send via Native Bluetooth Serial RFCOMM Socket
  if (state.bluetoothConnected && BtPlugin && BtPlugin.sendRawJson) {
    try {
      BtPlugin.sendRawJson({ json: jsonStr });
    } catch (e) {
      console.warn('Bluetooth send error:', e);
    }
  }
}

function handleServerMessage(data) {
  if (data.type === 'pong') {
    const rtt = Math.round(performance.now() - data.time);
    el.pingBadge.textContent = `${rtt}ms`;
    el.pingBadge.classList.remove('hidden');
  } else if (data.type === 'clipboard_data') {
    el.clipFetchResult.textContent = data.text || '(Clipboard is empty)';
    el.clipFetchResult.classList.remove('empty');
  } else if (data.type === 'server_info') {
    if (data.platform === 'mac' && state.osLayout !== 'mac') {
      setLayout('mac');
    }
  } else if (data.type === 'auth_result') {
    if (!data.success) {
      alert('Authentication failed: Incorrect password');
      showConnModal();
    }
  }
}

let pingInterval = null;
function startPingInterval() {
  stopPingInterval();
  pingInterval = setInterval(() => {
    sendPacket({ type: 'ping', time: performance.now() });
  }, 2500);
}

function stopPingInterval() {
  if (pingInterval) clearInterval(pingInterval);
  el.pingBadge.classList.add('hidden');
}

function updateConnStatus(status, text) {
  el.connDot.className = `status-dot ${status}`;
  el.connText.textContent = text;
}

// =========================================================
// 2. APPLE MAGIC TRACKPAD GESTURES & MOUSE
// =========================================================
let gestureState = {
  isDoubleTapDrag: false,
  twoFingerDistance: null,
  initialTouchCount: 0,
};

function initTrackpad() {
  const surface = el.trackpadArea;

  surface.addEventListener('pointerdown', (e) => {
    surface.setPointerCapture(e.pointerId);
    const now = performance.now();
    state.activePointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: now,
      moved: false,
    });

    renderTouchPointers();

    // Check for 1-finger double tap to drag
    if (state.activePointers.size === 1) {
      if (now - state.lastTapTime < 280) {
        state.dragMode = true;
        sendPacket({ type: 'mouse_down', button: getPrimaryButton() });
        haptic(30);
      }
    }
  });

  surface.addEventListener('pointermove', (e) => {
    if (!state.activePointers.has(e.pointerId)) return;
    const pt = state.activePointers.get(e.pointerId);
    const dx = (e.clientX - pt.x) * state.cursorSpeed;
    const dy = (e.clientY - pt.y) * state.cursorSpeed;

    pt.x = e.clientX;
    pt.y = e.clientY;
    if (Math.hypot(e.clientX - pt.startX, e.clientY - pt.startY) > 8) {
      pt.moved = true;
    }

    renderTouchPointers();

    const pointerCount = state.activePointers.size;

    // 1 FINGER: Move Cursor or Drag
    if (pointerCount === 1) {
      sendPacket({ type: 'mouse_move', dx, dy });
    }
    // 2 FINGERS: Scroll or Pinch Zoom
    else if (pointerCount === 2) {
      const pts = Array.from(state.activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

      if (gestureState.twoFingerDistance === null) {
        gestureState.twoFingerDistance = dist;
      } else {
        const pinchDelta = dist - gestureState.twoFingerDistance;
        // Pinch zoom threshold
        if (Math.abs(pinchDelta) > 25) {
          if (pinchDelta > 0) {
            sendPacket({ type: 'web_action', action: 'zoom_in' });
          } else {
            sendPacket({ type: 'web_action', action: 'zoom_out' });
          }
          gestureState.twoFingerDistance = dist;
          haptic(10);
          return;
        }
      }

      // Smooth 2-finger scroll
      const scrollDy = dy * 0.4 * state.scrollSpeed;
      const scrollDx = dx * 0.4 * state.scrollSpeed;
      sendPacket({ type: 'mouse_scroll', dx: scrollDx, dy: -scrollDy });
    }
  });

  const onPointerRelease = (e) => {
    if (!state.activePointers.has(e.pointerId)) return;
    const pt = state.activePointers.get(e.pointerId);
    const now = performance.now();
    const duration = now - pt.startTime;
    const moved = pt.moved;
    const countAtStart = state.activePointers.size;

    state.activePointers.delete(e.pointerId);
    renderTouchPointers();
    gestureState.twoFingerDistance = null;

    // Release drag mode if active
    if (state.dragMode) {
      state.dragMode = false;
      sendPacket({ type: 'mouse_up', button: getPrimaryButton() });
      haptic(20);
      return;
    }

    // 1-FINGER TAP: Primary click (left click or right if left-handed)
    if (countAtStart === 1 && !moved && duration < 240) {
      sendPacket({ type: 'mouse_click', button: getPrimaryButton() });
      haptic(15);
      state.lastTapTime = now;
    }
    // 2-FINGER TAP: Secondary click (right click or left if left-handed)
    else if (countAtStart === 2 && !moved && duration < 260) {
      sendPacket({ type: 'mouse_click', button: getSecondaryButton() });
      haptic(25);
    }
    // 3-FINGER SWIPES
    else if (countAtStart === 3 && moved) {
      const deltaY = pt.y - pt.startY;
      const deltaX = pt.x - pt.startX;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        if (deltaY < -50) {
          // Swipe up: Task View / Mission Control
          sendPacket({ type: 'app_action', action: 'task_view' });
          haptic(40);
        } else if (deltaY > 50) {
          // Swipe down: Show Desktop
          sendPacket({ type: 'app_action', action: 'show_desktop' });
          haptic(40);
        }
      } else {
        if (deltaX > 50) {
          // Swipe right: Switch Next App
          sendPacket({ type: 'app_action', action: 'switch_next' });
          haptic(30);
        } else if (deltaX < -50) {
          // Swipe left: Switch Prev App
          sendPacket({ type: 'app_action', action: 'switch_prev' });
          haptic(30);
        }
      }
    }
  };

  surface.addEventListener('pointerup', onPointerRelease);
  surface.addEventListener('pointercancel', onPointerRelease);

  // Secondary Scroll Strip
  let lastScrollY = null;
  el.scrollStrip.addEventListener('pointerdown', (e) => {
    el.scrollStrip.setPointerCapture(e.pointerId);
    lastScrollY = e.clientY;
  });
  el.scrollStrip.addEventListener('pointermove', (e) => {
    if (lastScrollY !== null) {
      const delta = (e.clientY - lastScrollY) * state.scrollSpeed * 0.8;
      lastScrollY = e.clientY;
      sendPacket({ type: 'mouse_scroll', dx: 0, dy: -delta });
    }
  });
  const endScrollStrip = () => { lastScrollY = null; };
  el.scrollStrip.addEventListener('pointerup', endScrollStrip);
  el.scrollStrip.addEventListener('pointercancel', endScrollStrip);

  // Physical Click Buttons
  el.btnMouseLeft.addEventListener('click', () => {
    sendPacket({ type: 'mouse_click', button: getPrimaryButton() });
    haptic(15);
  });
  el.btnMouseMiddle.addEventListener('click', () => {
    sendPacket({ type: 'mouse_click', button: 'middle' });
    haptic(20);
  });
  el.btnMouseRight.addEventListener('click', () => {
    sendPacket({ type: 'mouse_click', button: getSecondaryButton() });
    haptic(15);
  });
}

function getPrimaryButton() {
  return state.leftHanded ? 'right' : 'left';
}

function getSecondaryButton() {
  return state.leftHanded ? 'left' : 'right';
}

function renderTouchPointers() {
  const container = el.touchPointers;
  container.innerHTML = '';
  const rect = el.trackpadArea.getBoundingClientRect();

  state.activePointers.forEach((pt) => {
    const dot = document.createElement('div');
    dot.className = 'touch-dot';
    dot.style.left = `${pt.x - rect.left}px`;
    dot.style.top = `${pt.y - rect.top}px`;
    container.appendChild(dot);
  });
}

// =========================================================
// 3. GYRO MOUSE (GYROSCOPE CONTROLLER)
// =========================================================
function initGyro() {
  el.btnGyroToggle.addEventListener('click', () => {
    toggleGyro();
  });

  el.btnCalibrateGyro.addEventListener('click', () => {
    state.gyroCalibrated = false;
    haptic(20);
  });

  // Hold to Steer Button
  const holdBtn = el.btnHoldGyro;
  holdBtn.addEventListener('pointerdown', () => {
    state.gyroHoldActive = true;
    holdBtn.classList.add('active');
  });
  const endHold = () => {
    state.gyroHoldActive = false;
    holdBtn.classList.remove('active');
  };
  holdBtn.addEventListener('pointerup', endHold);
  holdBtn.addEventListener('pointercancel', endHold);

  window.addEventListener('deviceorientation', handleDeviceOrientation);
}

function toggleGyro() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+ permission dialog
    DeviceOrientationEvent.requestPermission()
      .then((permissionState) => {
        if (permissionState === 'granted') {
          activateGyroState(!state.gyroActive);
        } else {
          alert('Gyroscope permission was denied.');
        }
      })
      .catch(console.error);
  } else {
    activateGyroState(!state.gyroActive);
  }
}

function activateGyroState(active) {
  state.gyroActive = active;
  state.gyroCalibrated = false;
  el.btnGyroToggle.classList.toggle('active', active);
  el.gyroHud.classList.toggle('hidden', !active);
  haptic(25);
}

function handleDeviceOrientation(e) {
  if (!state.gyroActive && !state.gyroHoldActive) return;

  const beta = e.beta;   // Pitch (-180 to 180)
  const gamma = e.gamma; // Roll (-90 to 90)
  if (beta === null || gamma === null) return;

  if (!state.gyroCalibrated) {
    state.gyroBaseBeta = beta;
    state.gyroBaseGamma = gamma;
    state.lastGyroBeta = beta;
    state.lastGyroGamma = gamma;
    state.gyroCalibrated = true;
    return;
  }

  const dGamma = gamma - state.lastGyroGamma;
  const dBeta = beta - state.lastGyroBeta;

  state.lastGyroBeta = beta;
  state.lastGyroGamma = gamma;

  // Deadzone filter for resting hands
  if (Math.abs(dGamma) < 0.25 && Math.abs(dBeta) < 0.25) return;

  const dx = dGamma * state.gyroSens * 3.5;
  const dy = dBeta * state.gyroSens * 3.5;

  sendPacket({ type: 'mouse_move', dx, dy });
}

// =========================================================
// 4. KEYBOARD & VOICE INPUT
// =========================================================
function initKeyboard() {
  // Send text buffer
  const submitText = () => {
    const text = el.keyboardBuffer.value;
    if (text) {
      sendPacket({ type: 'keyboard_type', text });
      el.keyboardBuffer.value = '';
      haptic(15);
    }
  };

  el.btnSendText.addEventListener('click', submitText);
  el.keyboardBuffer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitText();
    }
  });

  // Single keys click
  document.querySelectorAll('[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      sendPacket({ type: 'keyboard_key', key });
      haptic(10);
    });
  });

  // Quick shortcuts
  const shortcutMap = {
    select_all: ['ctrl', 'a'],
    copy: ['ctrl', 'c'],
    cut: ['ctrl', 'x'],
    paste: ['ctrl', 'v'],
    undo: ['ctrl', 'z'],
    save: ['ctrl', 's'],
    find: ['ctrl', 'f'],
    screenshot: state.osLayout === 'mac' ? ['cmd', 'shift', '4'] : ['win', 'shift', 's'],
  };

  document.querySelectorAll('[data-hotkey]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const keyCombo = shortcutMap[btn.dataset.hotkey];
      if (keyCombo) {
        sendPacket({ type: 'keyboard_hotkey', keys: keyCombo });
        haptic(15);
      }
    });
  });

  // Modifier toggles
  document.querySelectorAll('[data-mod]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      haptic(10);
    });
  });

  // Layout switcher
  el.btnLayoutPC.addEventListener('click', () => setLayout('pc'));
  el.btnLayoutMac.addEventListener('click', () => setLayout('mac'));

  // Voice Input (Web Speech API)
  initSpeechRecognition();
  el.btnVoiceInput.addEventListener('click', toggleVoiceDictation);
  el.btnMicInline.addEventListener('click', toggleVoiceDictation);
}

function setLayout(layout) {
  state.osLayout = layout;
  localStorage.setItem('rm_os', layout);
  el.osBadge.textContent = layout.toUpperCase();

  el.btnLayoutPC.classList.toggle('active', layout === 'pc');
  el.btnLayoutMac.classList.toggle('active', layout === 'mac');

  if (layout === 'mac') {
    el.keyCtrl.textContent = 'Control';
    el.keyWin.textContent = 'Cmd ⌘';
    el.keyAlt.textContent = 'Option ⌥';
  } else {
    el.keyCtrl.textContent = 'Ctrl';
    el.keyWin.textContent = 'Win';
    el.keyAlt.textContent = 'Alt';
  }

  sendPacket({ type: 'set_layout', layout });
  haptic(15);
}

function initSpeechRecognition() {
  const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechClass) {
    el.btnVoiceInput.style.display = 'none';
    el.btnMicInline.style.display = 'none';
    return;
  }

  state.speechRecognition = new SpeechClass();
  state.speechRecognition.continuous = false;
  state.speechRecognition.interimResults = false;

  state.speechRecognition.onstart = () => {
    state.speechActive = true;
    el.btnMicInline.classList.add('recording');
    el.btnVoiceInput.classList.add('active');
  };

  state.speechRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript) {
      sendPacket({ type: 'keyboard_type', text: transcript });
      el.keyboardBuffer.value = transcript;
    }
  };

  state.speechRecognition.onend = () => {
    state.speechActive = false;
    el.btnMicInline.classList.remove('recording');
    el.btnVoiceInput.classList.remove('active');
  };
}

function toggleVoiceDictation() {
  if (!state.speechRecognition) return;
  if (state.speechActive) {
    state.speechRecognition.stop();
  } else {
    state.speechRecognition.start();
    haptic(20);
  }
}

// =========================================================
// 5. SPECIALTY PANELS & REORDERING
// =========================================================
function initSpecialtyPanels() {
  // Media controls
  document.querySelectorAll('[data-media]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sendPacket({ type: 'media_action', action: btn.dataset.media });
      haptic(15);
    });
  });

  // Web controls
  document.querySelectorAll('[data-web]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sendPacket({ type: 'web_action', action: btn.dataset.web });
      haptic(15);
    });
  });

  // App Switcher controls
  document.querySelectorAll('[data-app]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sendPacket({ type: 'app_action', action: btn.dataset.app });
      haptic(15);
    });
  });

  // Power actions (with modal confirmation for restart/shutdown)
  document.querySelectorAll('[data-power]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.power;
      if (act === 'restart' || act === 'shutdown') {
        promptPowerAction(act);
      } else {
        sendPacket({ type: 'power_action', action: act });
        haptic(30);
      }
    });
  });

  // Clipboard sync
  el.btnClipSend.addEventListener('click', () => {
    const text = el.clipSendText.value;
    sendPacket({ type: 'clipboard_set', text, auto_paste: false });
    haptic(15);
  });

  el.btnClipSendPaste.addEventListener('click', () => {
    const text = el.clipSendText.value;
    sendPacket({ type: 'clipboard_set', text, auto_paste: true });
    haptic(15);
  });

  el.btnClipFetch.addEventListener('click', () => {
    sendPacket({ type: 'clipboard_get' });
    haptic(15);
  });

  // Panel reordering logic
  initPanelReorder();
}

function promptPowerAction(action) {
  state.pendingPowerAction = action;
  el.modalPowerTitle.textContent = action === 'shutdown' ? 'Shut Down Computer?' : 'Restart Computer?';
  el.modalPowerDesc.textContent = `Are you sure you want to ${action} the computer remotely? Unsaved work will be lost.`;
  el.modalPower.classList.remove('hidden');
}

el.btnCancelPower.addEventListener('click', () => {
  state.pendingPowerAction = null;
  el.modalPower.classList.add('hidden');
});

el.btnConfirmPower.addEventListener('click', () => {
  if (state.pendingPowerAction) {
    sendPacket({ type: 'power_action', action: state.pendingPowerAction });
    state.pendingPowerAction = null;
  }
  el.modalPower.classList.add('hidden');
});

function initPanelReorder() {
  const container = el.panelsContainer;
  const savedOrder = JSON.parse(localStorage.getItem('rm_panel_order') || 'null');

  if (savedOrder && Array.isArray(savedOrder)) {
    savedOrder.forEach((id) => {
      const card = container.querySelector(`[data-panel-id="${id}"]`);
      if (card) container.appendChild(card);
    });
  }

  container.addEventListener('click', (e) => {
    const upBtn = e.target.closest('.btn-move-up');
    const downBtn = e.target.closest('.btn-move-down');
    if (!upBtn && !downBtn) return;

    const card = e.target.closest('.panel-card');
    if (!card) return;

    if (upBtn && card.previousElementSibling) {
      container.insertBefore(card, card.previousElementSibling);
      savePanelOrder();
      haptic(10);
    } else if (downBtn && card.nextElementSibling) {
      container.insertBefore(card.nextElementSibling, card);
      savePanelOrder();
      haptic(10);
    }
  });
}

function savePanelOrder() {
  const cards = el.panelsContainer.querySelectorAll('.panel-card');
  const order = Array.from(cards).map((c) => c.dataset.panelId);
  localStorage.setItem('rm_panel_order', JSON.stringify(order));
}

// =========================================================
// 6. PHYSICAL VOLUME BUTTON INTERCEPTION
// =========================================================
function initPhysicalVolumeButtons() {
  const audio = el.volumeAudio;
  audio.volume = 0.5;

  let isHandlingVolume = false;

  audio.addEventListener('volumechange', () => {
    if (!el.toggleVolButtons.checked || isHandlingVolume) return;

    isHandlingVolume = true;
    if (audio.volume > 0.5) {
      sendPacket({ type: 'media_action', action: 'volup' });
      haptic(10);
    } else if (audio.volume < 0.5) {
      sendPacket({ type: 'media_action', action: 'voldown' });
      haptic(10);
    }

    // Reset volume back to 0.5 for subsequent events
    setTimeout(() => {
      audio.volume = 0.5;
      isHandlingVolume = false;
    }, 100);
  });

  // Enable silent audio playback on first interaction
  const unlockAudio = () => {
    audio.play().catch(() => {});
    document.removeEventListener('pointerdown', unlockAudio);
  };
  document.addEventListener('pointerdown', unlockAudio);

  // Native keyboard volume keys fallback
  window.addEventListener('keydown', (e) => {
    if (!el.toggleVolButtons.checked) return;
    if (e.key === 'AudioVolumeUp' || e.key === 'VolumeUp') {
      sendPacket({ type: 'media_action', action: 'volup' });
    } else if (e.key === 'AudioVolumeDown' || e.key === 'VolumeDown') {
      sendPacket({ type: 'media_action', action: 'voldown' });
    }
  });
}

// =========================================================
// 7. SETTINGS, WALLPAPERS & CUSTOMIZATION
// =========================================================
function initSettings() {
  // Populate current settings
  el.cfgHost.value = state.host;
  el.cfgWsPort.value = state.port;
  el.cfgPassword.value = state.password;
  el.toggleLeftHanded.checked = state.leftHanded;
  el.sliderSpeed.value = state.cursorSpeed;
  el.sliderGyroSens.value = state.gyroSens;
  el.sliderScrollSpeed.value = state.scrollSpeed;
  applyTheme(state.theme);
  applyCustomWallpaper(state.customWallpaper);
  applyLeftHanded(state.leftHanded);

  // Save connection
  el.btnSaveConn.addEventListener('click', () => {
    state.host = el.cfgHost.value.trim() || '127.0.0.1';
    state.port = parseInt(el.cfgWsPort.value, 10) || 8001;
    state.password = el.cfgPassword.value.trim();

    localStorage.setItem('rm_host', state.host);
    localStorage.setItem('rm_port', state.port);
    localStorage.setItem('rm_password', state.password);

    if (state.ws) state.ws.close();
    connectWebSocket();
    alert('Settings saved. Reconnecting...');
  });

  // Web Bluetooth Scan button
  el.btnBluetoothScan.addEventListener('click', async () => {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth API is not supported in this browser. Use Chrome/Edge or connect via Bluetooth PAN.');
      return;
    }
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
      });
      alert(`Bluetooth device selected: ${device.name || device.id}. Pair via OS Bluetooth settings for full remote connection.`);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        alert(`Bluetooth pairing error: ${err.message}`);
      }
    }
  });

  // Sliders
  el.sliderSpeed.addEventListener('input', (e) => {
    state.cursorSpeed = parseFloat(e.target.value);
    el.lblSpeed.textContent = `${state.cursorSpeed.toFixed(1)}x`;
    localStorage.setItem('rm_speed', state.cursorSpeed);
  });

  el.sliderGyroSens.addEventListener('input', (e) => {
    state.gyroSens = parseFloat(e.target.value);
    el.lblGyroSens.textContent = `${state.gyroSens.toFixed(1)}x`;
    localStorage.setItem('rm_gyro_sens', state.gyroSens);
  });

  el.sliderScrollSpeed.addEventListener('input', (e) => {
    state.scrollSpeed = parseFloat(e.target.value);
    el.lblScrollSpeed.textContent = `${state.scrollSpeed.toFixed(1)}x`;
    localStorage.setItem('rm_scroll_speed', state.scrollSpeed);
  });

  // Left-Handed Mode Toggle
  el.toggleLeftHanded.addEventListener('change', (e) => {
    applyLeftHanded(e.target.checked);
  });

  // Theme presets
  document.querySelectorAll('.theme-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(btn.dataset.theme);
    });
  });

  // Custom Wallpaper Upload
  el.wallpaperUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        applyCustomWallpaper(evt.target.result);
      };
      reader.readAsDataURL(file);
    }
  });

  el.btnClearWallpaper.addEventListener('click', () => {
    applyCustomWallpaper('');
  });
}

function applyTheme(themeName) {
  state.theme = themeName;
  document.body.className = `${themeName} ${state.leftHanded ? 'left-handed' : ''}`;
  localStorage.setItem('rm_theme', themeName);
}

function applyCustomWallpaper(dataUrl) {
  state.customWallpaper = dataUrl;
  if (dataUrl) {
    document.body.style.backgroundImage = `url(${dataUrl})`;
    localStorage.setItem('rm_custom_bg', dataUrl);
  } else {
    document.body.style.backgroundImage = 'none';
    localStorage.removeItem('rm_custom_bg');
  }
}

function applyLeftHanded(isLeft) {
  state.leftHanded = isLeft;
  localStorage.setItem('rm_left_handed', isLeft);
  document.body.classList.toggle('left-handed', isLeft);
  if (isLeft) {
    el.btnMouseLeft.querySelector('.btn-mouse-text').textContent = 'Right Click';
    el.btnMouseRight.querySelector('.btn-mouse-text').textContent = 'Left Click';
  } else {
    el.btnMouseLeft.querySelector('.btn-mouse-text').textContent = 'Left Click';
    el.btnMouseRight.querySelector('.btn-mouse-text').textContent = 'Right Click';
  }
}

function initConnectionModal() {
  // Tabs
  el.tabConnWifi.addEventListener('click', () => {
    el.tabConnWifi.classList.add('active');
    el.tabConnBt.classList.remove('active');
    el.tabContentWifi.classList.add('active');
    el.tabContentBt.classList.remove('active');
  });

  el.tabConnBt.addEventListener('click', () => {
    el.tabConnBt.classList.add('active');
    el.tabConnWifi.classList.remove('active');
    el.tabContentBt.classList.add('active');
    el.tabContentWifi.classList.remove('active');
    loadPairedBluetoothDevices();
  });

  // IP suggestion chips
  document.querySelectorAll('.ip-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const ip = chip.dataset.ip;
      el.modalHostInput.value = ip;
      state.host = ip;
      localStorage.setItem('rm_host', ip);
      hideConnModal();
      if (state.ws) state.ws.close();
      connectWebSocket();
      haptic(15);
    });
  });

  // LAN Auto-Scanner
  el.btnScanLan.addEventListener('click', async () => {
    el.btnScanLan.textContent = 'Scanning...';
    el.btnScanLan.disabled = true;

    const testSubnets = ['192.168.101', '192.168.137', '192.168.1', '192.168.0', '172.16.0'];
    let foundIp = null;

    // Check known candidate IPs first
    const candidates = ['192.168.101.73', '192.168.137.1', '172.16.0.2', '192.168.1.100', '192.168.0.100'];
    for (const ip of candidates) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600);
        const res = await fetch(`http://${ip}:8000/api/discover`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data.app === 'Remote Mouse') {
            foundIp = ip;
            break;
          }
        }
      } catch (e) {}
    }

    el.btnScanLan.textContent = 'Scan';
    el.btnScanLan.disabled = false;

    if (foundIp) {
      el.modalHostInput.value = foundIp;
      state.host = foundIp;
      localStorage.setItem('rm_host', foundIp);
      alert(`Found PC server at ${foundIp}! Connecting...`);
      hideConnModal();
      if (state.ws) state.ws.close();
      connectWebSocket();
    } else {
      alert('Auto-scan could not find PC automatically. Please enter your PC IP (e.g. 192.168.101.73).');
    }
  });

  // Bluetooth Direct API
  el.btnBtRefresh.addEventListener('click', loadPairedBluetoothDevices);
  el.btnCloseConnModalBt.addEventListener('click', hideConnModal);

  el.btnBtDisconnect.addEventListener('click', async () => {
    if (BtPlugin) {
      await BtPlugin.disconnect();
      state.bluetoothConnected = false;
      el.btActiveStatus.classList.add('hidden');
      updateConnStatus('disconnected', 'Disconnected');
      loadPairedBluetoothDevices();
    }
  });

  el.btnBtPairSettings.addEventListener('click', async () => {
    if (BtPlugin && BtPlugin.openBluetoothSettings) {
      try {
        await BtPlugin.openBluetoothSettings();
      } catch (e) {
        alert('Buka Pengaturan HP > Bluetooth, cari nama PC (Alwayszeed) dan lakukan Pair.');
      }
    } else {
      alert('Buka Pengaturan HP > Bluetooth, cari nama PC (Alwayszeed) dan lakukan Pair.');
    }
  });

  // Listen for Bluetooth status change event from native plugin
  if (BtPlugin && BtPlugin.addListener) {
    BtPlugin.addListener('bluetoothStatusChange', (info) => {
      state.bluetoothConnected = info.connected;
      if (info.connected) {
        state.connectedBtName = info.name || 'PC';
        updateConnStatus('connected', `Connected (${state.connectedBtName})`);
        el.btActiveStatus.classList.remove('hidden');
        el.btActiveText.textContent = `Connected: ${state.connectedBtName}`;
      } else {
        el.btActiveStatus.classList.add('hidden');
        if (!state.connected) {
          updateConnStatus('disconnected', 'Disconnected');
        }
      }
      loadPairedBluetoothDevices();
    });
  }
}

async function loadPairedBluetoothDevices() {
  const container = el.btDeviceList;
  if (!BtPlugin) {
    container.innerHTML = '<div class="bt-status-msg">Native Bluetooth API is available inside the installed Android APK. If running in web browser, use Wi-Fi or Web Bluetooth.</div>';
    return;
  }

  container.innerHTML = '<div class="bt-status-msg">Loading paired devices...</div>';
  try {
    if (BtPlugin.requestBluetoothPermission) {
      try {
        await BtPlugin.requestBluetoothPermission();
      } catch (permErr) {
        console.warn('Bluetooth permission request note:', permErr);
      }
    }

    const res = await BtPlugin.getPairedDevices();
    const devices = res.devices || [];

    if (devices.length === 0) {
      container.innerHTML = '<div class="bt-status-msg">Belum ada perangkat PC yang di-pair di Bluetooth HP.<br><br>1. Tap tombol <b>"Pair di Pengaturan Bluetooth HP"</b> di bawah.<br>2. Cari nama PC Anda (<b>Alwayszeed</b>) lalu tap Pair.<br>3. Kembali ke aplikasi ini dan tap <b>Refresh</b>.</div>';
      return;
    }

    container.innerHTML = '';
    devices.forEach((dev) => {
      const item = document.createElement('div');
      item.className = 'bt-device-item';

      const info = document.createElement('div');
      info.className = 'bt-device-info';
      info.innerHTML = `<span class="bt-device-name">${dev.name}</span><span class="bt-device-addr">${dev.address}</span>`;

      const btn = document.createElement('button');
      btn.className = 'btn-mini' + (dev.connected ? ' btn-danger-soft' : ' btn-mini-action');
      btn.textContent = dev.connected ? 'Disconnect' : 'Connect';

      btn.addEventListener('click', async () => {
        if (dev.connected) {
          await BtPlugin.disconnect();
          state.bluetoothConnected = false;
          updateConnStatus('disconnected', 'Disconnected');
        } else {
          btn.textContent = 'Connecting...';
          btn.disabled = true;
          try {
            const res = await BtPlugin.connectDevice({ address: dev.address });
            if (res && res.success) {
              state.bluetoothConnected = true;
              state.connectedBtName = res.name || dev.name;
              updateConnStatus('connected', `Connected (${state.connectedBtName})`);
              hideConnModal();
              haptic(30);
            }
          } catch (err) {
            state.bluetoothConnected = false;
            alert('Bluetooth connect failed: ' + (err.message || err));
            updateConnStatus('disconnected', 'Disconnected');
          }
        }
        loadPairedBluetoothDevices();
      });

      item.appendChild(info);
      item.appendChild(btn);
      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = `<div class="bt-status-msg">Error loading devices: ${err.message || err}</div>`;
  }
}

// Navigation Tabs
function initNav() {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const targetView = document.getElementById(tab.dataset.view);
      if (targetView) targetView.classList.add('active');
      haptic(10);
    });
  });

  el.btnQuickSettings.addEventListener('click', () => {
    document.querySelector('[data-view="viewSettings"]').click();
  });

  el.btnConnModal.addEventListener('click', showConnModal);
  el.btnCloseConnModal.addEventListener('click', hideConnModal);
  el.btnModalReconnect.addEventListener('click', () => {
    const h = el.modalHostInput.value.trim();
    const p = parseInt(el.modalPortInput.value, 10);
    if (h) state.host = h;
    if (p) state.port = p;
    localStorage.setItem('rm_host', state.host);
    localStorage.setItem('rm_port', state.port);
    hideConnModal();
    if (state.ws) state.ws.close();
    connectWebSocket();
  });

  initConnectionModal();

  // If on mobile app and not yet connected, auto-show connection modal
  if (isNative && !state.connected && !state.bluetoothConnected) {
    setTimeout(showConnModal, 600);
  }
}

function showConnModal() {
  el.modalHostInput.value = state.host;
  el.modalPortInput.value = state.port;
  el.modalConn.classList.remove('hidden');
}

function hideConnModal() {
  el.modalConn.classList.add('hidden');
}

function haptic(ms = 10) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) {}
  }
}

// Service Worker Registration for PWA Offline Functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  });
}

// =========================================================
// INITIALIZATION
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  initTrackpad();
  initGyro();
  initKeyboard();
  initSpecialtyPanels();
  initPhysicalVolumeButtons();
  initSettings();
  initNav();
  connectWebSocket();
});
