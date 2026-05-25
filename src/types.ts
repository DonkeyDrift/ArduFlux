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

export interface ArduFluxBoardState {
  name: string;
  fqbn: string;
  compileArgs: string[];
  pinDefines: Record<string, unknown>;
}

export interface ArduFluxPortState {
  address: string;
  auto: boolean;
  lastSuccessfulAddress: string;
}

export interface ArduFluxBuildState {
  outputDir: string;
  recentOutputDirs: string[];
  sketchPath: string;
  compileBeforeUpload?: boolean;
  uploadThenMonitor?: boolean;
}

export interface ArduFluxMonitorState {
  enabled: boolean;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  newline: string;
  resetOnConnect?: boolean;
}

export interface ArduFluxWslSyncLibrariesState {
  enabled: boolean;
  windowsPath: string;
  wslPath: string;
  mode: "copy-missing" | "mirror";
  backup: boolean;
  excludes: string[];
}

export interface ArduFluxWslState {
  enabled: boolean;
  distro: string;
  workspaceRoot: string;
  syncLibraries: ArduFluxWslSyncLibrariesState;
}

export interface ArduFluxCurrentConfig {
  board: ArduFluxBoardState;
  port: ArduFluxPortState;
  build: ArduFluxBuildState;
  monitor: ArduFluxMonitorState;
  wsl: ArduFluxWslState;
}

export interface ArduFluxConfig {
  schemaVersion: number;
  current: ArduFluxCurrentConfig;
  profiles: Record<string, Partial<ArduFluxCurrentConfig>>;
  cache?: ArduFluxCache;
}

export interface ArduFluxCachePort {
  address: string;
  label: string;
  protocol: string;
  type: string;
}

export interface ArduFluxCache {
  ports?: {
    items: ArduFluxCachePort[];
    timestamp: number;
  };
  libraries?: {
    items: string[];
    inoHash: string;
    timestamp: number;
  };
}

export interface ValidationErrorLike {
  message: string;
  suggestion?: string;
}

export const CONFIG_FILE_NAME = "ArduFlux.json";

export function createDefaultWslState(): ArduFluxWslState {
  return {
    enabled: false,
    distro: "",
    workspaceRoot: "",
    syncLibraries: {
      enabled: false,
      windowsPath: "",
      wslPath: "~/Arduino/libraries",
      mode: "copy-missing",
      backup: false,
      excludes: []
    }
  };
}

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

export function createDefaultConfig(): ArduFluxConfig {
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
        recentOutputDirs: [],
        sketchPath: "",
        compileBeforeUpload: false,
        uploadThenMonitor: false
      },
      monitor: {
        enabled: true,
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        newline: "CRLF",
        resetOnConnect: true
      },
      wsl: createDefaultWslState()
    },
    profiles: {
      default: {}
    }
  };
}
