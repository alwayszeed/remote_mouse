package com.remotemouse.controller;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothRemote",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        )
    }
)
public class BluetoothRemotePlugin extends Plugin {
    private static final String TAG = "BluetoothRemote";

    // Standard Bluetooth Serial Port Profile (SPP / RFCOMM) UUID
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket rfcommSocket;
    private OutputStream outputStream;
    private InputStream inputStream;
    private BluetoothDevice connectedTargetDevice;
    private boolean isConnected = false;
    private Thread readThread;

    @Override
    public void load() {
        super.load();
    }

    private boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private void ensureAdapter() {
        if (bluetoothAdapter == null && hasBluetoothPermission()) {
            try {
                bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
            } catch (Throwable ignored) {}
        }
    }

    private void notifyConnection(String name, String address, boolean connected, String error) {
        try {
            JSObject ret = new JSObject();
            ret.put("name", name != null ? name : "PC");
            ret.put("address", address != null ? address : "");
            ret.put("connected", connected);
            if (error != null) ret.put("error", error);
            notifyListeners("bluetoothStatusChange", ret);
        } catch (Throwable t) {
            Log.e(TAG, "Error in notifyConnection: ", t);
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            ensureAdapter();
            boolean hasPerm = hasBluetoothPermission();

            JSObject ret = new JSObject();
            ret.put("hasPermission", hasPerm);
            ret.put("supported", bluetoothAdapter != null);
            ret.put("enabled", bluetoothAdapter != null && bluetoothAdapter.isEnabled());
            ret.put("connected", isConnected && rfcommSocket != null && rfcommSocket.isConnected());
            if (connectedTargetDevice != null) {
                try {
                    ret.put("deviceName", connectedTargetDevice.getName());
                    ret.put("deviceAddress", connectedTargetDevice.getAddress());
                } catch (Throwable ignored) {}
            }
            call.resolve(ret);
        } catch (Throwable t) {
            JSObject ret = new JSObject();
            ret.put("hasPermission", false);
            ret.put("supported", false);
            ret.put("enabled", false);
            ret.put("connected", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void requestBluetoothPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (getPermissionState("bluetooth") != PermissionState.GRANTED) {
                requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        boolean granted = getPermissionState("bluetooth") == PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Throwable t) {
            Log.e(TAG, "openBluetoothSettings error: ", t);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", t.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    @SuppressLint("MissingPermission")
    public void getPairedDevices(PluginCall call) {
        try {
            if (!hasBluetoothPermission()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    requestPermissionForAlias("bluetooth", call, "getPairedDevicesCallback");
                    return;
                }
            }

            ensureAdapter();

            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
                JSObject res = new JSObject();
                res.put("devices", new JSArray());
                res.put("message", "Bluetooth is disabled or not supported");
                call.resolve(res);
                return;
            }

            Set<BluetoothDevice> paired = bluetoothAdapter.getBondedDevices();
            JSArray arr = new JSArray();
            if (paired != null) {
                for (BluetoothDevice dev : paired) {
                    try {
                        JSObject obj = new JSObject();
                        obj.put("name", dev.getName() != null ? dev.getName() : "Unknown Device");
                        obj.put("address", dev.getAddress());
                        boolean isCur = connectedTargetDevice != null && dev.getAddress().equals(connectedTargetDevice.getAddress()) && isConnected;
                        obj.put("connected", isCur);
                        arr.put(obj);
                    } catch (Throwable ignored) {}
                }
            }

            JSObject res = new JSObject();
            res.put("devices", arr);
            call.resolve(res);
        } catch (Throwable t) {
            Log.e(TAG, "getPairedDevices error: ", t);
            JSObject res = new JSObject();
            res.put("devices", new JSArray());
            res.put("error", t.getMessage());
            call.resolve(res);
        }
    }

    @PermissionCallback
    private void getPairedDevicesCallback(PluginCall call) {
        getPairedDevices(call);
    }

    @PluginMethod
    @SuppressLint("MissingPermission")
    public void connectDevice(PluginCall call) {
        final String address = call.getString("address");
        if (address == null) {
            call.reject("Device address required");
            return;
        }

        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission not granted");
            return;
        }

        ensureAdapter();

        new Thread(() -> {
            try {
                if (bluetoothAdapter.isDiscovering()) {
                    bluetoothAdapter.cancelDiscovery();
                }

                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
                BluetoothSocket socket = null;

                // 1. Try standard RFCOMM SPP socket
                try {
                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                } catch (Exception e1) {
                    Log.w(TAG, "Standard SPP failed, trying insecure: " + e1.getMessage());
                    // 2. Try insecure RFCOMM socket
                    try {
                        socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                        socket.connect();
                    } catch (Exception e2) {
                        Log.w(TAG, "Insecure SPP failed, trying reflection port 1: " + e2.getMessage());
                        // 3. Fallback via reflection (common on some Android/Samsung devices)
                        Method m = device.getClass().getMethod("createRfcommSocket", new Class[]{int.class});
                        socket = (BluetoothSocket) m.invoke(device, 1);
                        socket.connect();
                    }
                }

                rfcommSocket = socket;
                outputStream = socket.getOutputStream();
                inputStream = socket.getInputStream();
                connectedTargetDevice = device;
                isConnected = true;

                Log.d(TAG, "Bluetooth RFCOMM connected to " + device.getName());

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("name", device.getName());
                ret.put("address", device.getAddress());
                call.resolve(ret);

                notifyConnection(device.getName(), device.getAddress(), true, null);

                // Start reader thread to detect disconnects
                startReadThread();

            } catch (Throwable t) {
                Log.e(TAG, "Bluetooth connect failed: ", t);
                isConnected = false;
                connectedTargetDevice = null;
                call.reject("Connection failed: " + t.getMessage());
                notifyConnection(null, address, false, t.getMessage());
            }
        }).start();
    }

    private void startReadThread() {
        if (readThread != null && readThread.isAlive()) {
            readThread.interrupt();
        }
        readThread = new Thread(() -> {
            byte[] buf = new byte[1024];
            while (isConnected && inputStream != null) {
                try {
                    int r = inputStream.read(buf);
                    if (r == -1) break;
                } catch (Exception e) {
                    break;
                }
            }
            // Disconnected
            isConnected = false;
            String devName = connectedTargetDevice != null ? connectedTargetDevice.getName() : null;
            String devAddr = connectedTargetDevice != null ? connectedTargetDevice.getAddress() : null;
            connectedTargetDevice = null;
            notifyConnection(devName, devAddr, false, "Disconnected by peer");
        });
        readThread.setDaemon(true);
        readThread.start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            isConnected = false;
            if (outputStream != null) {
                try { outputStream.close(); } catch (Exception ignored) {}
                outputStream = null;
            }
            if (inputStream != null) {
                try { inputStream.close(); } catch (Exception ignored) {}
                inputStream = null;
            }
            if (rfcommSocket != null) {
                try { rfcommSocket.close(); } catch (Exception ignored) {}
                rfcommSocket = null;
            }
            connectedTargetDevice = null;

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Throwable t) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void sendRawJson(PluginCall call) {
        String json = call.getString("json");
        if (json == null || outputStream == null || !isConnected) {
            call.resolve();
            return;
        }

        try {
            byte[] bytes = (json + "\n").getBytes(StandardCharsets.UTF_8);
            outputStream.write(bytes);
            outputStream.flush();
            call.resolve();
        } catch (Throwable t) {
            call.resolve();
        }
    }

    @PluginMethod
    public void sendMouseMove(PluginCall call) {
        int dx = call.getInt("dx", 0);
        int dy = call.getInt("dy", 0);
        int wheel = call.getInt("wheel", 0);
        String json = "{\"type\":\"mouse_move\",\"dx\":" + dx + ",\"dy\":" + dy + ",\"wheel\":" + wheel + "}";
        sendJsonInternal(json);
        call.resolve();
    }

    @PluginMethod
    public void sendMouseClick(PluginCall call) {
        String button = call.getString("button", "left");
        String json = "{\"type\":\"mouse_click\",\"button\":\"" + button + "\"}";
        sendJsonInternal(json);
        call.resolve();
    }

    @PluginMethod
    public void sendMouseDown(PluginCall call) {
        String button = call.getString("button", "left");
        String json = "{\"type\":\"mouse_down\",\"button\":\"" + button + "\"}";
        sendJsonInternal(json);
        call.resolve();
    }

    @PluginMethod
    public void sendMouseUp(PluginCall call) {
        String button = call.getString("button", "left");
        String json = "{\"type\":\"mouse_up\",\"button\":\"" + button + "\"}";
        sendJsonInternal(json);
        call.resolve();
    }

    private synchronized void sendJsonInternal(String json) {
        if (outputStream == null || !isConnected) return;
        try {
            byte[] bytes = (json + "\n").getBytes(StandardCharsets.UTF_8);
            outputStream.write(bytes);
            outputStream.flush();
        } catch (Throwable t) {
            Log.e(TAG, "Write failed: ", t);
        }
    }
}
