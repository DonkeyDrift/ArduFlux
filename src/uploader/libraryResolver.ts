import { execFileText } from "../configStore";
import { spawn as nodeSpawn } from "child_process";

export const SYSTEM_HEADERS = new Set([
  "Arduino.h",
  "Wire.h",
  "SPI.h",
  "SoftwareSerial.h",
  "EEPROM.h",
  "FS.h",
  "SD.h",
  "SD_MMC.h",
  "SPIFFS.h",
  "LittleFS.h",
  "Preferences.h",
  "WiFi.h",
  "WiFiClient.h",
  "WiFiServer.h",
  "WiFiUdp.h",
  "WiFiClientSecure.h",
  "HTTPClient.h",
  "WebServer.h",
  "Update.h",
  "ESPmDNS.h",
  "DNSServer.h",
  "ArduinoOTA.h",
  "BluetoothSerial.h",
  "BLEDevice.h",
  "BLEServer.h",
  "BLEUtils.h",
  "BLE2902.h",
  "BLERemoteCharacteristic.h",
  "BLERemoteService.h",
  "BLEDescriptor.h",
  "NimBLEDevice.h",
  "NimBLEServer.h",
  "NimBLEHIDDevice.h",
  "NimBLECharacteristic.h",
  "NimBLEAdvertising.h",
  "NimBLEConnInfo.h",
  "NimBLEClient.h",
  "NimBLEUUID.h",
  "NimBLEScan.h",
  "esp_sleep.h",
  "esp_wifi.h",
  "esp_timer.h",
  "esp_system.h",
  "driver/ledc.h",
  "driver/touch_sensor.h",
  "driver/gpio.h",
  "driver/adc.h",
  "driver/uart.h",
  "soc/rtc_cntl_reg.h",
  "rom/rtc.h",
  "hal/touch_sensor_types.h",
  "Ticker.h",
  "assert.h",
  "stdlib.h",
  "stdint.h",
  "stddef.h",
  "stdbool.h",
  "string.h",
  "stdio.h",
  "math.h",
  "limits.h",
  "ctype.h",
  "time.h",
  "errno.h",
  "stdarg.h",
  "cstdlib",
  "cstdint",
  "cstddef",
  "cstdbool",
  "cstring",
  "cstdio",
  "cmath",
  "climits",
  "cctype",
  "ctime",
  "cerrno",
  "cstdarg",
  "cassert",
  "new",
  "typeinfo",
  "exception",
  "initializer_list",
  "utility",
  "tuple",
  "type_traits",
  "functional",
  "algorithm",
  "iterator",
  "vector",
  "array",
  "deque",
  "list",
  "forward_list",
  "set",
  "map",
  "unordered_set",
  "unordered_map",
  "stack",
  "queue",
  "string",
  "string_view",
  "memory",
  "memory_resource",
  "atomic",
  "mutex",
  "thread",
  "condition_variable",
  "future",
  "chrono",
  "ratio",
  "complex",
  "valarray",
  "numeric",
  "limits",
  "locale",
  "codecvt",
  "regex",
  "filesystem",
  "optional",
  "variant",
  "any",
  "bitset",
  "iosfwd",
  "ios",
  "istream",
  "ostream",
  "iostream",
  "sstream",
  "fstream",
  "iomanip",
  "streambuf",
]);

export const LIBRARY_NAME_OVERRIDES: Record<string, string> = {
  "Adafruit_Sensor.h": "Adafruit Unified Sensor",
  "BleGamepad.h": "ESP32-BLE-Gamepad",
};

export function parseRequiredLibraries(inoContent: string): string[] {
  const required = new Set<string>();
  const lines = inoContent.split(/\r?\n/);

  for (const line of lines) {
    const match = /^\s*#include\s+<([^>]+)>/.exec(line);
    if (!match) {
      continue;
    }
    const header = match[1].trim();
    if (!header) {
      continue;
    }
    if (SYSTEM_HEADERS.has(header)) {
      continue;
    }

    if (LIBRARY_NAME_OVERRIDES[header]) {
      required.add(LIBRARY_NAME_OVERRIDES[header]);
      continue;
    }

    const baseName = header.replace(/\.h$/, "");
    if (!baseName) {
      continue;
    }

    const libName = baseName.replace(/_/g, " ");
    required.add(libName);
  }

  return Array.from(required);
}

export function resolveMissingLibraries(required: string[], installed: string[]): string[] {
  const installedSet = new Set(installed);
  return required.filter((lib) => !installedSet.has(lib));
}

export async function getInstalledLibraries(
  arduinoCliPath: string,
  exec: typeof execFileText = execFileText
): Promise<string[]> {
  const result = await exec(arduinoCliPath, ["lib", "list", "--format", "json"], 10000);
  if (result.exitCode !== 0) {
    return [];
  }

  try {
    const raw = JSON.parse(result.stdout || "[]") as unknown;
    const libsArray: Array<{ library?: { name?: string }; name?: string }> = [];

    if (raw && typeof raw === "object" && "installed_libraries" in raw && Array.isArray((raw as { installed_libraries: unknown[] }).installed_libraries)) {
      libsArray.push(...(raw as { installed_libraries: Array<{ library?: { name?: string }; name?: string }> }).installed_libraries);
    } else if (Array.isArray(raw)) {
      libsArray.push(...raw);
    }

    return libsArray
      .map((item) => {
        if (item.library && item.library.name) {
          return item.library.name;
        }
        if (item.name) {
          return item.name;
        }
        return "";
      })
      .filter((name) => name !== "");
  } catch {
    return [];
  }
}

export async function installLibraries(
  libs: string[],
  arduinoCliPath: string,
  _cwd: string,
  onOutput?: (line: string) => void,
  spawnImpl: typeof nodeSpawn = nodeSpawn
): Promise<void> {
  for (const lib of libs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawnImpl(arduinoCliPath, ["lib", "install", lib], { shell: false });
        proc?.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          if (onOutput) {
            for (const line of text.split(/\r?\n/)) {
              if (line) {
                onOutput(line);
              }
            }
          }
        });
        proc?.stderr?.on("data", (data: Buffer) => {
          const text = data.toString();
          if (onOutput) {
            for (const line of text.split(/\r?\n/)) {
              if (line) {
                onOutput(line);
              }
            }
          }
        });
        proc?.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Failed to install library "${lib}" (exit code: ${code ?? "unknown"})`));
          }
        });
        proc?.on("error", (err) => {
          reject(new Error(`Failed to install library "${lib}": ${err.message}`));
        });
        if (!proc) {
          reject(new Error(`Failed to spawn arduino-cli for library "${lib}"`));
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (onOutput) {
        onOutput(`Warning: ${message} — skipping, will try to compile anyway`);
      }
    }
  }
}
