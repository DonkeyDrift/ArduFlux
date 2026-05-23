English | [中文](README.zh-CN.md)

# ArduFlux

VS Code extension that provides end-to-end development support for Arduino family boards (UNO, Nano, ESP32, ESP8266, etc.), managing board configuration including board type, serial port, compile parameters, serial monitor, and profiles.

## Project Repositories

- **Official Repository (GitHub)**: [DonkeyDrift/ArduFlux](https://github.com/DonkeyDrift/ArduFlux) — Primary repository, accepts Issues, Forks, and Pull Requests. All contributions should be submitted here.
- **Mirror Repository (Gitee)**: [donkeydrift/ArduFlux](https://gitee.com/donkeydrift/ArduFlux) — Read-only mirror for faster access in mainland China, only for downloading. Does not accept Issues, Forks, or Pull Requests.

## Features

- **Configuration Management**: Visually edit the `ArduFlux.json` configuration file
- **Board Configuration**: Select from preset board types (Arduino UNO, Nano, ESP32-S3, ESP32-C3, ESP8266, etc.), customize FQBN, compile arguments, and pin definitions
- **Serial Port Management**: Automatically enumerate serial ports, prioritize USB ports, and detect port occupancy
- **Compile & Upload**: Integrated arduino-cli compile and upload functionality
- **Serial Monitor**: Configure baud rate, data bits, stop bits, parity, and line ending
- **Profiles**: Save, apply, delete, import, and export configuration schemes
- **Status Display**: Real-time current configuration display in the VS Code status bar

## Prerequisites

Before using, please ensure the following are installed:

1. **VS Code or TRAE IDE** - version ≥ 1.90.0
2. **arduino-cli** - for compiling and uploading Arduino firmware
3. **Node.js** - for local development (only required when contributing)

### Installing arduino-cli

Windows users can install via:

```powershell
# Install using scoop
scoop install arduino-cli

# Or download manually: https://arduino.github.io/arduino-cli/latest/installation/
```

Verify installation:
```bash
arduino-cli version
```

## Installation

### Method 1: Install from Extension Marketplace (Recommended)

Install directly from your IDE's extension marketplace:

- **VS Code Marketplace**: [DonkeyDrift.arduflux](https://marketplace.visualstudio.com/items?itemName=DonkeyDrift.arduflux)
- **Open VSX Registry**: [DonkeyDrift.arduflux](https://open-vsx.org/extension/DonkeyDrift/arduflux)

Steps:
1. Open the Extensions view (`Ctrl+Shift+X`)
2. Search for `ArduFlux`
3. Click **Install**

### Method 2: Automatic Script Installation

Run the PowerShell script from the project root:

```powershell
# Auto-detect IDE (TRAE preferred)
npm run install:vsix

# Force TRAE
npm run install:vsix:trae

# Force VS Code
npm run install:vsix:code
```

The script will automatically:
1. Uninstall any previous version of the extension (if present)
2. Install the latest VSIX package
3. Prompt to reload the window

### Method 3: Manual VSIX Installation

1. First package the VSIX file:
   ```bash
   npm run package
   ```
   This generates a file like `arduflux-0.3.3.vsix`

2. Install in VS Code / TRAE:
   - Open the Extensions view (`Ctrl+Shift+X`)
   - Click the `...` menu in the top right corner
   - Select `Install from VSIX...`
   - Choose the generated `.vsix` file

3. Reload the window for the extension to take effect

### Method 4: Global CLI Installation (for Kimi Code / Claude Code / MCP)

```bash
npm install -g arduflux
```

After installation, the `arduflux-mcp` command is globally available for interacting with AI clients (Kimi Code, Claude Desktop, Cursor, etc.) via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

#### Configuring Kimi Code

```bash
kimi mcp add --transport stdio arduflux -- arduflux-mcp "--stdio" "--workspace" "."
kimi mcp test arduflux
```

After launching Kimi Code, type `/mcp` to see `arduflux` with 14 available tools (such as `arduflux_get_state`, `arduflux_compile`, `arduflux_upload`, etc.).

#### Configuring Claude Code

```bash
claude mcp add --transport stdio --scope user arduflux -- arduflux-mcp "--stdio" "--workspace" "."
claude mcp get arduflux
```

After launching `claude`, type `/mcp` to see `arduflux` with 14 available tools.

> If you prefer not to install globally, you can also run `npx arduflux-mcp --stdio --workspace .` directly.

### Method 5: Local Development Mode

See the [Local Development](#local-development) section.

## Usage

### 1. Opening the Configuration Panel

There are three ways to open the configuration panel:

- **Keyboard Shortcut**: `Ctrl+Alt+E` (Mac: `Cmd+Alt+E`)
- **Command Palette**: Press `F1` or `Ctrl+Shift+P`, type `ArduFlux: Open Panel`
- **Activity Bar**: Click the ArduFlux icon (circuit board icon) in the left sidebar

### 2. Basic Configuration Flow

The configuration panel is divided into the following sections:

#### Board Configuration
- **Select Board Type**: Choose from preset board types in the dropdown (e.g., ESP32-S3, ESP32-C3, etc.)
- **Custom FQBN**: Manually enter a fully qualified board name (e.g., `esp32:esp32:esp32s3`)
- **Compile Arguments**: Add additional compile arguments (e.g., `-DDEBUG=1`)
- **Pin Definitions**: Configure pin mapping in JSON format

#### Serial Port Configuration
- **Auto-select**: When enabled, the extension scans and recommends USB serial ports
- **Manual Select**: Choose from available serial ports in the dropdown
- **Port Detection**: Automatically detects whether a port is occupied

#### Build Configuration
- **Output Directory**: Set the build output directory (default: `build`)
- **Recent**: Quickly select from recent output directories (up to 5 entries)

#### Serial Monitor
- **Baud Rate**: Common options (9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600)
- **Data Bits**: 5-8 bits (default: 8)
- **Stop Bits**: 1, 1.5, 2 (default: 1)
- **Parity**: None, Odd, Even, Mark, Space (default: None)
- **Line Ending**: CR, LF, CRLF, None (default: CRLF)

### 3. Compile and Upload

#### Using Extension Commands

- **Compile**: `Ctrl+Shift+B` or command `ArduFlux: Compile Sketch`
- **Upload**: `Ctrl+Shift+U` or command `ArduFlux: Upload Sketch`

#### Using the Cross-Platform Upload Core

- **Full workflow (Compile + Upload + Monitor)**: `ArduFlux: Full Compile+Upload+Monitor (Script)`
- **Compile only**: `ArduFlux: Compile Only (Script)`
- **Upload + Monitor only**: `ArduFlux: Upload+Monitor Only (Script)`

These commands invoke the cross-platform Node.js upload core (`src/uploader/`), supporting Windows / macOS / Linux, with automatic library installation, multi-port retry, and other features.

### 4. Profiles Management

Profiles allow you to save multiple configuration schemes:

- **Save Current as Profile**: Enter a name to save the current configuration
- **Apply Profile**: Select from the list to switch configurations with one click
- **Delete Profile**: Remove configuration schemes no longer needed
- **Export Profile**: Export configurations to JSON files for easy sharing
- **Import Profile**: Import configurations from JSON files

### 5. Other Features

#### Validate Configuration
Command: `ArduFlux: Validate Current Configuration`
Checks whether the configuration is complete and valid, outputting errors and suggestions.

#### Open Configuration File
Command: `ArduFlux: Open Configuration File`
Directly opens `ArduFlux.json` in the editor for manual editing.

#### Refresh View
Click the refresh icon in the panel title bar to reload the configuration state.

## Command Reference

| Command | Shortcut | Description |
|---------|----------|-------------|
| `ArduFlux: Open Panel` | `Ctrl+Alt+E` | Open the sidebar configuration panel |
| `ArduFlux: Validate Current Configuration` | `Ctrl+Alt+V` | Validate configuration validity |
| `ArduFlux: Open Configuration File` | - | Open the JSON configuration in the editor |
| `ArduFlux: Compile Sketch` | `Ctrl+Shift+B` | Compile the current sketch |
| `ArduFlux: Upload Sketch` | `Ctrl+Shift+U` | Upload firmware to the development board |
| `ArduFlux: Refresh Sidebar` | - | Refresh the view state |
| `ArduFlux: Full Compile+Upload+Monitor (Script)` | - | Invoke the Node.js upload core for the full workflow |
| `ArduFlux: Compile Only (Script)` | - | Invoke the Node.js upload core for compilation only |
| `ArduFlux: Upload+Monitor Only (Script)` | - | Invoke the Node.js upload core for upload only |

## Configuration File

The extension uses `ArduFlux.json` as its configuration file, located in the workspace root:

```json
{
  "schemaVersion": 1,
  "current": {
    "board": {
      "name": "ESP32-S3 (Generic)",
      "fqbn": "esp32:esp32:esp32s3",
      "compileArgs": [],
      "pinDefines": {
        "ws2812_pin": 48
      }
    },
    "port": {
      "address": "COM36",
      "auto": true
    },
    "build": {
      "outputDir": "build",
      "recentOutputDirs": ["build"]
    },
    "monitor": {
      "enabled": true,
      "baudRate": 115200,
      "dataBits": 8,
      "stopBits": 1,
      "parity": "none",
      "newline": "CRLF"
    }
  },
  "profiles": {
    "default": {}
  }
}
```

### Important Notes

- `schemaVersion` is used for configuration migration, do not modify manually
- `profiles` always contains the `default` configuration
- `recentOutputDirs` is automatically deduplicated and keeps the most recent 5 entries
- `pinDefines` must be a valid JSON object

## Local Development

### Environment Setup

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch
```

### Debugging the Extension

1. Open the project in VS Code
2. Press `F5` to launch the extension development host
3. Test extension features in the new window

### Running Tests

```bash
# TypeScript unit tests
npm test

# Test watch mode
npm run test:watch

# Python unit tests (legacy tools)
python -m unittest discover -s tests -v
```

### Packaging the VSIX

```bash
npm run package
```

The generated file is located in the project root, named in the format `arduflux-<version>.vsix`.

## Project Structure

```
.
├── src/                          # VS Code extension source (TypeScript)
│   ├── extension.ts              # Extension entry: register commands, status bar, etc.
│   ├── editorView.ts             # Sidebar Webview view provider
│   ├── webviewController.ts      # Webview controller: UI, message routing
│   ├── configStore.ts            # Configuration read/write, validation, serial port enumeration
│   ├── types.ts                  # Type definitions, preset boards
│   ├── terminal.ts               # Pseudoterminal wrapper
│   ├── statusBar.ts              # Status bar text formatting
│   └── test/                     # TypeScript unit tests
├── dist/                         # Compiled output (CommonJS)
├── embedded_config/              # Python legacy configuration tools (maintenance mode)
├── tests/                        # Python unit tests
├── docs/                         # Technical documentation
├── ArduFlux.json                 # Runtime configuration file
├── ArduFlux.template.json        # Configuration file template
├── install-vsix.ps1              # Automatic installation script
├── package.json                  # Extension manifest + npm scripts
└── tsconfig.json                 # TypeScript compilation configuration
```

## FAQ

### Q: Commands not found after installing the extension?
A: Please reload the window (`Ctrl+Shift+P` → `Reload Window`).

### Q: Serial port list is empty?
A: Check that the device is connected and the driver is properly installed, then click refresh.

### Q: Compilation says arduino-cli not found?
A: Ensure arduino-cli is installed and in your system PATH, or restart the IDE.

### Q: Panel not updating after modifying ArduFlux.json?
A: Click the refresh icon in the panel title bar, or reopen the panel.

### Q: How to revert to default configuration?
A: Apply the `default` Profile to restore.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

MIT
