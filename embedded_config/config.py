from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import typing as t
from dataclasses import dataclass
from pathlib import Path


class ValidationError(ValueError):
    def __init__(self, message: str, suggestion: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.suggestion = suggestion


BoardPinDefines = dict[str, t.Any]


@dataclass(frozen=True)
class BoardCatalogItem:
    name: str
    fqbn: str
    compile_args: list[str]
    pin_defines: BoardPinDefines


DEFAULT_BOARD_CATALOG: list[BoardCatalogItem] = [
    BoardCatalogItem(
        name="ESP32-S3 (Generic)",
        fqbn="esp32:esp32:esp32s3",
        compile_args=[],
        pin_defines={
            "ws2812_pin": 48,
            "touch_pins": {"T0": 4, "T2": 2, "T5": 12, "BOOT(GPIO0)": 0},
        },
    ),
    BoardCatalogItem(
        name="ESP32 Dev Module",
        fqbn="esp32:esp32:esp32",
        compile_args=[],
        pin_defines={},
    ),
    BoardCatalogItem(
        name="Arduino Uno",
        fqbn="arduino:avr:uno",
        compile_args=[],
        pin_defines={},
    ),
    BoardCatalogItem(
        name="STM32 (Custom FQBN)",
        fqbn="",
        compile_args=[],
        pin_defines={},
    ),
]


def _run(
    args: list[str],
    *,
    runner: t.Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> subprocess.CompletedProcess[str]:
    return runner(args, capture_output=True, text=True, encoding="utf-8", errors="replace")


def list_serial_ports(
    *,
    arduino_cli: str = "arduino-cli",
    runner: t.Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> list[dict[str, str]]:
    json_result = _run([arduino_cli, "board", "list", "--format", "json"], runner=runner)
    if json_result.returncode == 0:
        try:
            data = json.loads(json_result.stdout or "[]")
        except json.JSONDecodeError:
            data = []

        if isinstance(data, dict):
            if isinstance(data.get("detected_ports"), list):
                detected_ports = t.cast(list[t.Any], data.get("detected_ports") or [])
                ports: list[dict[str, str]] = []
                for entry in detected_ports:
                    if not isinstance(entry, dict):
                        continue
                    port_obj = entry.get("port")
                    if not isinstance(port_obj, dict):
                        continue
                    address = str(port_obj.get("address") or "").strip()
                    if not address:
                        continue
                    if address.upper().startswith("COM"):
                        address = address.upper()
                    ports.append(
                        {
                            "address": address,
                            "label": str(port_obj.get("label") or ""),
                            "protocol": str(port_obj.get("protocol") or ""),
                            "type": str(port_obj.get("protocol_label") or ""),
                        }
                    )
                return ports

            if isinstance(data.get("ports"), list):
                data = data["ports"]
            elif isinstance(data.get("result"), list):
                data = data["result"]
            else:
                data = []

        if not isinstance(data, list):
            data = []

        ports: list[dict[str, str]] = []
        for item in data:
            if isinstance(item, str):
                address = item.strip()
                if not address:
                    continue
                ports.append({"address": address.upper() if address.upper().startswith("COM") else address, "label": "", "protocol": "", "type": ""})
                continue

            if isinstance(item, dict):
                if isinstance(item.get("port"), dict):
                    port_obj = t.cast(dict[str, t.Any], item.get("port"))
                    address = str(port_obj.get("address") or "").strip()
                    if not address:
                        continue
                    if address.upper().startswith("COM"):
                        address = address.upper()
                    ports.append(
                        {
                            "address": address,
                            "label": str(port_obj.get("label") or ""),
                            "protocol": str(port_obj.get("protocol") or ""),
                            "type": str(port_obj.get("protocol_label") or ""),
                        }
                    )
                    continue

                address = str(item.get("address") or "").strip()
                if not address:
                    continue
                if address.upper().startswith("COM"):
                    address = address.upper()
                ports.append(
                    {
                        "address": address,
                        "label": str(item.get("label") or ""),
                        "protocol": str(item.get("protocol") or ""),
                        "type": str(item.get("type") or ""),
                    }
                )
        return ports

    text_result = _run([arduino_cli, "board", "list"], runner=runner)
    if text_result.returncode != 0:
        return []

    ports: list[dict[str, str]] = []
    lines = [ln.rstrip("\r\n") for ln in (text_result.stdout or "").splitlines() if ln.strip()]
    for ln in lines:
        if ln.lower().startswith("port") and "protocol" in ln.lower():
            continue
        m = re.search(r"\b(COM\d+)\b", ln, flags=re.IGNORECASE)
        if m:
            ports.append({"address": m.group(1).upper(), "label": ln, "protocol": "", "type": ""})
            continue
        if "/dev/" in ln:
            dev = ln.strip().split()[0]
            ports.append({"address": dev, "label": ln, "protocol": "", "type": ""})
    return ports


def is_port_busy(port: str) -> bool:
    if not port:
        return False

    system = platform.system()
    if system == "Windows":
        return _is_port_busy_windows(port)
    return _is_port_busy_posix(port)


def _is_port_busy_posix(port: str) -> bool:
    try:
        fd = os.open(port, os.O_RDWR | os.O_NONBLOCK)
    except OSError as e:
        return e.errno in {16, 13}  # EBUSY(16) / EACCES(13)
    else:
        os.close(fd)
        return False


def _is_port_busy_windows(port: str) -> bool:
    import ctypes
    from ctypes import wintypes

    port = port.strip().upper()
    if not port.startswith("COM"):
        return False

    device = r"\\.\%s" % port
    GENERIC_READ = 0x80000000
    GENERIC_WRITE = 0x40000000
    OPEN_EXISTING = 3
    INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    CreateFileW = kernel32.CreateFileW
    CreateFileW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HANDLE,
    ]
    CreateFileW.restype = wintypes.HANDLE

    handle = CreateFileW(device, GENERIC_READ | GENERIC_WRITE, 0, None, OPEN_EXISTING, 0, None)
    if handle == INVALID_HANDLE_VALUE:
        err = ctypes.get_last_error()
        return err in {5, 32}  # ERROR_ACCESS_DENIED(5) / ERROR_SHARING_VIOLATION(32)

    kernel32.CloseHandle(handle)
    return False


def normalize_path(path_str: str, *, base_dir: Path) -> Path:
    raw = (path_str or "").strip()
    if not raw:
        raise ValidationError("路径为空", "请选择或输入一个有效目录")

    p = Path(os.path.expandvars(os.path.expanduser(raw)))
    if not p.is_absolute():
        p = (base_dir / p).resolve()
    return p


def _dedupe_keep_latest(items: list[str], *, limit: int) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in reversed(items):
        key = it.strip()
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
        if len(out) >= limit:
            break
    return list(reversed(out))


def _validate_fqbn(fqbn: str) -> None:
    fqbn = (fqbn or "").strip()
    if not fqbn:
        raise ValidationError("FQBN 不能为空", "例如：esp32:esp32:esp32s3 或 arduino:avr:uno")

    if fqbn.count(":") < 2:
        raise ValidationError("FQBN 格式不正确", "格式通常为 vendor:arch:board，例如 esp32:esp32:esp32s3")


def is_usb_port(port_info: dict[str, str]) -> bool:
    label = str(port_info.get("label") or "")
    port_type = str(port_info.get("type") or "")
    protocol = str(port_info.get("protocol") or "")
    text = " ".join([label, port_type, protocol]).upper()
    return "USB" in text


def recommend_serial_port(
    ports: list[dict[str, str]],
    *,
    saved_port: str = "",
    auto_select: bool = True,
) -> str:
    if not ports:
        return ""

    saved_port = (saved_port or "").strip()
    usb_ports = [p for p in ports if is_usb_port(p)]
    saved_entry = next((p for p in ports if p.get("address") == saved_port), None)
    saved_usb_entry = next((p for p in usb_ports if p.get("address") == saved_port), None)

    if auto_select:
        if saved_usb_entry:
            return str(saved_usb_entry.get("address") or "")
        if usb_ports:
            return str(usb_ports[0].get("address") or "")
        if saved_entry:
            return str(saved_entry.get("address") or "")
        return str(ports[0].get("address") or "")

    if saved_entry:
        return str(saved_entry.get("address") or "")
    if usb_ports:
        return str(usb_ports[0].get("address") or "")
    return str(ports[0].get("address") or "")


class ConfigStore:
    def __init__(
        self,
        *,
        base_dir: str | Path,
        config_path: str | Path | None = None,
        arduino_cli: str = "arduino-cli",
        runner: t.Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    ) -> None:
        self.base_dir = Path(base_dir).resolve()
        self.arduino_cli = arduino_cli
        self.runner = runner
        self.config_path = (
            Path(config_path).resolve()
            if config_path is not None
            else (self.base_dir / "embedded_board_config.json")
        )
        self._data = self._default_data()

    @staticmethod
    def _default_data() -> dict[str, t.Any]:
        return {
            "schemaVersion": 1,
            "current": {
                "board": {
                    "name": "ESP32-S3 (Generic)",
                    "fqbn": "esp32:esp32:esp32s3",
                    "compileArgs": [],
                    "pinDefines": DEFAULT_BOARD_CATALOG[0].pin_defines,
                },
                "port": {"address": "", "auto": True, "lastSuccessfulAddress": ""},
                "build": {"outputDir": "", "recentOutputDirs": []},
                "monitor": {
                    "enabled": True,
                    "baudRate": 115200,
                    "dataBits": 8,
                    "stopBits": 1,
                    "parity": "none",
                    "newline": "CRLF",
                },
            },
            "profiles": {"default": {}},
        }

    def load(self) -> dict[str, t.Any]:
        if not self.config_path.exists():
            self._data = self._default_data()
            return self._data

        text = self.config_path.read_text(encoding="utf-8-sig", errors="replace")
        data = json.loads(text or "{}")
        if not isinstance(data, dict):
            raise ValidationError("配置文件格式不正确", "请删除损坏的配置文件后重新生成")

        self._data = self._migrate(data)
        return self._data

    def save(self) -> None:
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")

    def _migrate(self, data: dict[str, t.Any]) -> dict[str, t.Any]:
        version = int(data.get("schemaVersion") or 0)
        if version <= 0:
            migrated = self._default_data()
            migrated["current"].update(data)
            return migrated
        if version == 1:
            out = self._default_data()
            out.update({k: v for k, v in data.items() if k in {"schemaVersion", "current", "profiles"}})
            if "current" not in out or not isinstance(out["current"], dict):
                out["current"] = self._default_data()["current"]
            if "profiles" not in out or not isinstance(out["profiles"], dict):
                out["profiles"] = {}
            if "default" not in out["profiles"]:
                out["profiles"]["default"] = {}
            # 修复：如果配置文件中的 pinDefines 为空对象，保留默认值
            current_board = out.get("current", {}).get("board", {})
            if isinstance(current_board, dict):
                pin_defines = current_board.get("pinDefines")
                if not pin_defines or (isinstance(pin_defines, dict) and len(pin_defines) == 0):
                    current_board["pinDefines"] = self._default_data()["current"]["board"]["pinDefines"]
            return out
        raise ValidationError("不支持的配置版本", f"schemaVersion={version}，请升级配置模块或重新生成配置文件")

    def get_current(self) -> dict[str, t.Any]:
        return t.cast(dict[str, t.Any], self._data["current"])

    def validate_board(self, board: dict[str, t.Any] | None = None) -> None:
        board = board or t.cast(dict[str, t.Any], self.get_current().get("board") or {})
        _validate_fqbn(str(board.get("fqbn") or ""))

    def validate_port(self, port: dict[str, t.Any] | None = None) -> None:
        port = port or t.cast(dict[str, t.Any], self.get_current().get("port") or {})
        address = str(port.get("address") or "").strip()
        if not address:
            raise ValidationError("串口为空", "请刷新串口列表并选择一个端口，例如 COM36 或 /dev/ttyACM0")

        ports = list_serial_ports(arduino_cli=self.arduino_cli, runner=self.runner)
        known = {p["address"] for p in ports}
        if known and address not in known:
            raise ValidationError("串口不存在或不可用", "点击“刷新”重新枚举串口，或检查 USB 连接/驱动")

        if is_port_busy(address):
            raise ValidationError("串口被占用", "关闭串口监视器/其他串口工具后重试上传")

    def validate_build(self, build: dict[str, t.Any] | None = None) -> None:
        build = build or t.cast(dict[str, t.Any], self.get_current().get("build") or {})
        out_dir = str(build.get("outputDir") or "").strip()
        if not out_dir:
            return

        p = normalize_path(out_dir, base_dir=self.base_dir)
        try:
            p.mkdir(parents=True, exist_ok=True)
        except OSError:
            raise ValidationError("输出目录不可写", "请选择一个有写权限的目录，或更换到项目内的 build 目录")

    def validate_monitor(self, monitor: dict[str, t.Any] | None = None) -> None:
        monitor = monitor or t.cast(dict[str, t.Any], self.get_current().get("monitor") or {})
        enabled = bool(monitor.get("enabled"))
        if not enabled:
            return

        baud = int(monitor.get("baudRate") or 0)
        if baud <= 0:
            raise ValidationError("波特率不正确", "设置为常见值，例如 115200")

        data_bits = int(monitor.get("dataBits") or 0)
        if data_bits not in {5, 6, 7, 8}:
            raise ValidationError("数据位不正确", "可选：5/6/7/8")

        stop_bits = float(monitor.get("stopBits") or 0)
        if stop_bits not in {1, 1.5, 2}:
            raise ValidationError("停止位不正确", "可选：1/1.5/2")

        parity = str(monitor.get("parity") or "none").lower()
        if parity not in {"none", "odd", "even", "mark", "space"}:
            raise ValidationError("校验位不正确", "可选：none/odd/even/mark/space")

        newline = str(monitor.get("newline") or "CRLF").upper()
        if newline not in {"CRLF", "LF", "CR"}:
            raise ValidationError("换行符不正确", "可选：CRLF/LF/CR")

    def set_board(self, *, name: str, fqbn: str, compile_args: list[str] | None = None, pin_defines: BoardPinDefines | None = None) -> None:
        board = self.get_current().setdefault("board", {})
        board["name"] = name
        board["fqbn"] = fqbn
        board["compileArgs"] = compile_args or []
        board["pinDefines"] = pin_defines or {}
        self.validate_board(board)

    def set_port(self, *, address: str, auto: bool = False) -> None:
        port = self.get_current().setdefault("port", {})
        port["address"] = address
        port["auto"] = bool(auto)
        self.validate_port(port)

    def set_last_successful_port(self, address: str) -> None:
        port = self.get_current().setdefault("port", {})
        port["lastSuccessfulAddress"] = (address or "").strip()

    def set_output_dir(self, *, output_dir: str) -> Path:
        build = self.get_current().setdefault("build", {})
        p = normalize_path(output_dir, base_dir=self.base_dir)
        build["outputDir"] = str(Path(output_dir))
        recent = t.cast(list[str], build.get("recentOutputDirs") or [])
        recent.append(str(p))
        build["recentOutputDirs"] = _dedupe_keep_latest(recent, limit=5)
        self.validate_build(build)
        return p

    def set_monitor(self, **kwargs: t.Any) -> None:
        monitor = self.get_current().setdefault("monitor", {})
        monitor.update(kwargs)
        self.validate_monitor(monitor)

    def save_profile(self, name: str) -> None:
        name = (name or "").strip()
        if not name:
            raise ValidationError("Profile 名称不能为空", "请输入一个 Profile 名称，例如 default/dev/prod")
        self._data.setdefault("profiles", {})[name] = json.loads(json.dumps(self.get_current()))

    def apply_profile(self, name: str) -> None:
        profiles = t.cast(dict[str, t.Any], self._data.get("profiles") or {})
        if name not in profiles:
            raise ValidationError("Profile 不存在", "请先保存 Profile，或从文件导入 Profile")
        profile = profiles[name]
        if not isinstance(profile, dict):
            raise ValidationError("Profile 格式错误", "请删除该 Profile 后重新创建")
        self._data["current"] = json.loads(json.dumps(profile))

    def delete_profile(self, name: str) -> None:
        profiles = t.cast(dict[str, t.Any], self._data.get("profiles") or {})
        profiles.pop(name, None)
        if not profiles:
            profiles["default"] = {}

    def export_profiles(self, path: str | Path) -> Path:
        p = normalize_path(str(path), base_dir=self.base_dir)
        data = {
            "schemaVersion": int(self._data.get("schemaVersion") or 1),
            "profiles": self._data.get("profiles") or {},
        }
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return p

    def import_profiles(self, path: str | Path, *, merge: bool = True) -> None:
        p = normalize_path(str(path), base_dir=self.base_dir)
        if not p.exists():
            raise ValidationError("导入文件不存在", "请选择一个有效的 JSON 文件")
        data = json.loads(p.read_text(encoding="utf-8-sig", errors="replace") or "{}")
        if not isinstance(data, dict) or "profiles" not in data:
            raise ValidationError("导入文件格式不正确", "应包含 profiles 字段")
        incoming = data.get("profiles") or {}
        if not isinstance(incoming, dict):
            raise ValidationError("profiles 字段格式不正确", "profiles 应为对象：{name: profile}")

        profiles = t.cast(dict[str, t.Any], self._data.setdefault("profiles", {}))
        if merge:
            profiles.update(incoming)
        else:
            self._data["profiles"] = dict(incoming)

    def validate_all(self) -> None:
        cur = self.get_current()
        self.validate_board(t.cast(dict[str, t.Any], cur.get("board") or {}))
        self.validate_port(t.cast(dict[str, t.Any], cur.get("port") or {}))
        self.validate_build(t.cast(dict[str, t.Any], cur.get("build") or {}))
        self.validate_monitor(t.cast(dict[str, t.Any], cur.get("monitor") or {}))
