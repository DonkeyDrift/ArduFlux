from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from embedded_config.config import ConfigStore, ValidationError, list_serial_ports, normalize_path, recommend_serial_port


class _Runner:
    def __init__(self, *, stdout: str = "", stderr: str = "", returncode: int = 0) -> None:
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode
        self.calls: list[list[str]] = []

    def __call__(self, args, capture_output, text, encoding, errors):
        self.calls.append(list(args))
        class _CP:
            def __init__(self, stdout, stderr, returncode):
                self.stdout = stdout
                self.stderr = stderr
                self.returncode = returncode
        return _CP(self.stdout, self.stderr, self.returncode)


class ConfigTests(unittest.TestCase):
    def test_load_default_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            store = ConfigStore(base_dir=d, config_path=Path(d) / "x.json")
            data = store.load()
            self.assertEqual(data["schemaVersion"], 1)
            self.assertIn("current", data)

    def test_normalize_path_relative(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = normalize_path("build", base_dir=Path(d))
            self.assertTrue(str(p).lower().endswith("build"))

    def test_set_output_dir_keeps_recent_5(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            store = ConfigStore(base_dir=d, config_path=Path(d) / "cfg.json")
            store.load()
            for i in range(10):
                store.set_output_dir(output_dir=f"build{i}")
            recent = store.get_current()["build"]["recentOutputDirs"]
            self.assertEqual(len(recent), 5)
            self.assertTrue(str(recent[-1]).lower().endswith("build9"))

    def test_profile_save_apply_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            store = ConfigStore(base_dir=d, config_path=Path(d) / "cfg.json")
            store.load()
            store.set_board(name="Arduino Uno", fqbn="arduino:avr:uno")
            store.save_profile("uno")
            store.set_board(name="ESP32", fqbn="esp32:esp32:esp32")
            store.apply_profile("uno")
            self.assertEqual(store.get_current()["board"]["fqbn"], "arduino:avr:uno")

    def test_profile_export_import(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            store = ConfigStore(base_dir=base, config_path=base / "cfg.json")
            store.load()
            store.save_profile("p1")
            export_path = base / "profiles.json"
            store.export_profiles(export_path)

            store2 = ConfigStore(base_dir=base, config_path=base / "cfg2.json")
            store2.load()
            store2.import_profiles(export_path, merge=True)
            self.assertIn("p1", store2._data["profiles"])

    def test_validate_fqbn(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            store = ConfigStore(base_dir=d, config_path=Path(d) / "cfg.json")
            store.load()
            with self.assertRaises(ValidationError):
                store.set_board(name="Bad", fqbn="esp32")


class PortsTests(unittest.TestCase):
    def test_list_ports_json_format(self) -> None:
        runner = _Runner(stdout=json.dumps([{"address": "COM3", "label": "USB", "protocol": "serial", "type": "usb"}]))
        ports = list_serial_ports(arduino_cli="arduino-cli", runner=runner)
        self.assertEqual(len(ports), 1)
        self.assertEqual(ports[0]["address"], "COM3")

    def test_list_ports_json_detected_ports(self) -> None:
        runner = _Runner(
            stdout=json.dumps(
                {
                    "detected_ports": [
                        {"port": {"address": "COM36", "label": "COM36", "protocol": "serial", "protocol_label": "Serial Port"}}
                    ]
                }
            )
        )
        ports = list_serial_ports(arduino_cli="arduino-cli", runner=runner)
        self.assertEqual(len(ports), 1)
        self.assertEqual(ports[0]["address"], "COM36")

    def test_list_ports_json_object_ports(self) -> None:
        runner = _Runner(stdout=json.dumps({"ports": [{"address": "COM7", "label": "X"}]}))
        ports = list_serial_ports(arduino_cli="arduino-cli", runner=runner)
        self.assertEqual(len(ports), 1)
        self.assertEqual(ports[0]["address"], "COM7")

    def test_list_ports_json_strings(self) -> None:
        runner = _Runner(stdout=json.dumps(["COM9", "COM10"]))
        ports = list_serial_ports(arduino_cli="arduino-cli", runner=runner)
        self.assertEqual([p["address"] for p in ports], ["COM9", "COM10"])

    def test_recommend_port_prefers_saved_usb(self) -> None:
        ports = [
            {"address": "COM10", "label": "COM10", "protocol": "serial", "type": "Serial Port (USB)"},
            {"address": "COM36", "label": "COM36", "protocol": "serial", "type": "Serial Port (USB)"},
        ]
        self.assertEqual(recommend_serial_port(ports, saved_port="COM36", auto_select=True), "COM36")

    def test_recommend_port_prefers_first_usb_when_saved_not_usb(self) -> None:
        ports = [
            {"address": "COM11", "label": "COM11", "protocol": "serial", "type": "Serial Port"},
            {"address": "COM36", "label": "COM36", "protocol": "serial", "type": "Serial Port (USB)"},
        ]
        self.assertEqual(recommend_serial_port(ports, saved_port="COM11", auto_select=True), "COM36")


if __name__ == "__main__":
    unittest.main()
