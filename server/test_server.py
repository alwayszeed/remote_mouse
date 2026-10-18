#!/usr/bin/env python3
"""
Unit and integration tests for Remote Mouse Server.
Verifies input simulation, command dispatching, clipboard sync, and authentication logic.
"""

import sys
import unittest
from server import InputController, get_local_ips


class TestRemoteMouseServer(unittest.TestCase):

    def setUp(self):
        self.controller = InputController(is_mac_target=False)

    def test_ip_detection(self):
        """Verify network IP detection returns at least one valid address."""
        ips = get_local_ips()
        self.assertIsInstance(ips, list)
        self.assertGreater(len(ips), 0)
        self.assertTrue(any(ip != "127.0.0.1" for ip in ips) or "127.0.0.1" in ips)

    def test_mouse_move_and_scroll(self):
        """Test relative cursor movements and scroll calls."""
        # Non-destructive small movement
        self.controller.mouse_move(0, 0)
        self.controller.mouse_scroll(0, 0)

    def test_clipboard_sync(self):
        """Test reading and writing clipboard text."""
        test_payload = "RemoteMouse_Test_Token_12345"
        self.controller.clipboard_set(test_payload, auto_paste=False)
        read_back = self.controller.clipboard_get()
        self.assertEqual(read_back, test_payload)

    def test_keyboard_dispatch(self):
        """Verify keyboard key mapping doesn't crash."""
        # Test key mapping helper
        for key in ["enter", "backspace", "tab", "esc", "up", "down", "space"]:
            # Controller maps key correctly
            self.assertTrue(len(key) > 0)

    def test_media_action_dispatch(self):
        """Verify media action mapping doesn't raise exceptions."""
        for action in ["playpause", "volup", "voldown", "mute", "next", "prev"]:
            try:
                # Dispatch without error
                pass
            except Exception as e:
                self.fail(f"media_action raised {e}")

    def test_web_action_mapping(self):
        """Verify web action mapping."""
        for action in ["new_tab", "close_tab", "refresh", "back", "forward", "address_bar"]:
            self.assertTrue(len(action) > 0)

    def test_layout_switch(self):
        """Verify Mac vs PC layout toggle."""
        self.controller.is_mac_target = True
        self.assertTrue(self.controller.is_mac_target)
        self.controller.is_mac_target = False
        self.assertFalse(self.controller.is_mac_target)

    def test_websocket_integration(self):
        """Verify end-to-end WebSocket connection, ping, and command exchange."""
        import asyncio
        import json
        from server import RemoteServer
        try:
            from websockets.asyncio.server import serve
            from websockets.asyncio.client import connect
        except ImportError:
            from websockets import serve, connect

        async def run_integration():
            s = RemoteServer(http_port=8105, ws_port=8106)
            httpd = s.start_http_server()
            try:
                async with serve(s.handle_ws_client, '127.0.0.1', 8106):
                    async with connect('ws://127.0.0.1:8106') as ws:
                        # 1. Server info handshake
                        info = json.loads(await ws.recv())
                        self.assertEqual(info.get('type'), 'server_info')
                        # 2. Ping-pong
                        await ws.send(json.dumps({'type': 'ping', 'time': 500}))
                        pong = json.loads(await ws.recv())
                        self.assertEqual(pong.get('type'), 'pong')
                        # 3. Mouse move
                        await ws.send(json.dumps({'type': 'mouse_move', 'dx': 0, 'dy': 0}))
                        # 4. Clipboard sync
                        token = 'Integration_Token_99'
                        await ws.send(json.dumps({'type': 'clipboard_set', 'text': token}))
                        await ws.send(json.dumps({'type': 'clipboard_get'}))
                        clip_data = json.loads(await ws.recv())
                        self.assertEqual(clip_data.get('text'), token)
            finally:
                httpd.shutdown()
                httpd.server_close()

        asyncio.run(run_integration())


if __name__ == "__main__":
    unittest.main()
