package com.remotemouse.controller;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            registerPlugin(BluetoothRemotePlugin.class);
        } catch (Throwable t) {
            Log.e("MainActivity", "Plugin registration failed safely: " + t.getMessage());
        }
        super.onCreate(savedInstanceState);
    }
}
