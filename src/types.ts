export interface BoardCatalogItem {
  name: string;
  fqbn: string;
  compileArgs: string[];
  pinDefines: Record<string, unknown>;
}

export interface SerialPortInfo {
  address: string;
  label: string;
  protocol: string;
  type: string;
}

export interface EmbeddedBoardState {
  name: string;
  fqbn: string;
  compileArgs: string[];
  pinDefines: Record<string, unknown>;
}

export interface EmbeddedPortState {
  address: string;
  auto: boolean;
  lastSuccessfulAddress: string;
}

export interface EmbeddedBuildState {
  outputDir: string;
  recentOutputDirs: string[];
}

export interface EmbeddedMonitorState {
  enabled: boolean;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  newline: string;
}

export interface EmbeddedCurrentConfig {
  board: EmbeddedBoardState;
  port: EmbeddedPortState;
  build: EmbeddedBuildState;
  monitor: EmbeddedMonitorState;
}

export interface EmbeddedBoardConfig {
  schemaVersion: number;
  current: EmbeddedCurrentConfig;
  profiles: Record<string, Partial<EmbeddedCurrentConfig>>;
}

export interface ValidationErrorLike {
  message: string;
  suggestion?: string;
}

export const CONFIG_FILE_NAME = "embedded_board_config.json";

export const DEFAULT_BOARD_CATALOG: BoardCatalogItem[] = [
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

export function createDefaultConfig(): EmbeddedBoardConfig {
  return {
    schemaVersion: 1,
    current: {
      board: {
        name: "ESP32-S3 (Generic)",
        fqbn: "esp32:esp32:esp32s3",
        compileArgs: [],
        pinDefines: structuredClone(DEFAULT_BOARD_CATALOG[0].pinDefines)
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
