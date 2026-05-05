"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BOARD_CATALOG = exports.CONFIG_FILE_NAME = void 0;
exports.createDefaultConfig = createDefaultConfig;
exports.CONFIG_FILE_NAME = "embedded_board_config.json";
exports.DEFAULT_BOARD_CATALOG = [
    {
        name: "ESP32-S3 (Generic)",
        fqbn: "esp32:esp32:esp32s3",
        compileArgs: [],
        pinDefines: {
            ws2812_pin: 48,
            touch_pins: {
                T0: 4,
                T2: 2,
                T5: 12,
                "BOOT(GPIO0)": 0
            }
        }
    },
    {
        name: "ESP32 Dev Module",
        fqbn: "esp32:esp32:esp32",
        compileArgs: [],
        pinDefines: {}
    },
    {
        name: "Arduino Uno",
        fqbn: "arduino:avr:uno",
        compileArgs: [],
        pinDefines: {}
    },
    {
        name: "STM32 (Custom FQBN)",
        fqbn: "",
        compileArgs: [],
        pinDefines: {}
    }
];
function createDefaultConfig() {
    return {
        schemaVersion: 1,
        current: {
            board: {
                name: "ESP32-S3 (Generic)",
                fqbn: "esp32:esp32:esp32s3",
                compileArgs: [],
                pinDefines: structuredClone(exports.DEFAULT_BOARD_CATALOG[0].pinDefines)
            },
            port: {
                address: "",
                auto: true,
                lastSuccessfulAddress: ""
            },
            build: {
                outputDir: "",
                recentOutputDirs: []
            },
            monitor: {
                enabled: true,
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: "none",
                newline: "CRLF"
            }
        },
        profiles: {
            default: {}
        }
    };
}
//# sourceMappingURL=types.js.map