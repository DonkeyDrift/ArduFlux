param(
    [switch]$c,
    [switch]$u,
    [switch]$s,
    [switch]$Debug,
    [string]$workspace,
    [string]$sketchPath
)

$script:debugMode = $Debug
$doCompile = $c -or (-not $c -and -not $u -and -not $s)
$doUpload = $u -or (-not $c -and -not $u -and -not $s)
$doMonitorBlock = (-not $c -and -not $u -and -not $s)
$forceMonitor = $s

function Get-ProjectRoot {
    param([string]$StartDir)
    $current = $StartDir
    while ($current) {
        if (Test-Path (Join-Path $current "ArduFlux.json")) { return $current }
        if (Test-Path (Join-Path $current "*.ino")) { return $current }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) { break }
        $current = $parent
    }
    return $StartDir
}

if ($workspace) {
    $projectRoot = $workspace
    Write-Host "Using workspace: $projectRoot"
} else {
    $projectRoot = Get-ProjectRoot -StartDir ($PSScriptRoot)
    Write-Host "Project root: $projectRoot"
}

$legacyConfigFile = Join-Path $projectRoot "upload_config.json"
$embeddedConfigFile = Join-Path $projectRoot "ArduFlux.json"

$defaultConfig = @{
    BoardName = "ESP32-S3 (Generic)"
    BoardFQBN = "esp32:esp32:esp32s3"
    Port = ""
    PortAuto = $true
    LastSuccessfulPort = ""
    OutputDir = ""
    RecentOutputDirs = @()
    SketchPath = ""
    CompileBeforeUpload = $false
    UploadThenMonitor = $false
    MonitorEnabled = $true
    BaudRate = 115200
    DataBits = 8
    StopBits = 1
    Parity = "none"
    Newline = "CRLF"
}

$configSource = "default"
$embeddedProfiles = @{}
$embeddedSchemaVersion = 1

$script:cache = @{}

if (Test-Path $embeddedConfigFile) {
    $embedded = Get-Content $embeddedConfigFile | ConvertFrom-Json
    $embeddedSchemaVersion = [int]($embedded.schemaVersion | ForEach-Object { $_ } )
    $embeddedProfiles = $embedded.profiles
    $cur = $embedded.current
    if (-not $cur) { $cur = $embedded }

    $config = $defaultConfig
    if ($cur.board) {
        if ($cur.board.name) { $config.BoardName = [string]$cur.board.name }
        if ($cur.board.fqbn) { $config.BoardFQBN = [string]$cur.board.fqbn }
    }
    if ($cur.port) {
        if ($cur.port.address) { $config.Port = [string]$cur.port.address }
        if ($null -ne $cur.port.auto) { $config.PortAuto = [bool]$cur.port.auto }
        if ($cur.port.lastSuccessfulAddress) { $config.LastSuccessfulPort = [string]$cur.port.lastSuccessfulAddress }
    }
    if ($cur.build) {
        if ($cur.build.outputDir) { $config.OutputDir = [string]$cur.build.outputDir }
        if ($cur.build.recentOutputDirs) { $config.RecentOutputDirs = @($cur.build.recentOutputDirs) }
        if ($cur.build.sketchPath) { $config.SketchPath = [string]$cur.build.sketchPath }
        if ($null -ne $cur.build.compileBeforeUpload) { $config.CompileBeforeUpload = [bool]$cur.build.compileBeforeUpload }
        if ($null -ne $cur.build.uploadThenMonitor) { $config.UploadThenMonitor = [bool]$cur.build.uploadThenMonitor }
    }
    if ($cur.monitor) {
        if ($null -ne $cur.monitor.enabled) { $config.MonitorEnabled = [bool]$cur.monitor.enabled }
        if ($cur.monitor.baudRate) { $config.BaudRate = [int]$cur.monitor.baudRate }
        if ($cur.monitor.dataBits) { $config.DataBits = [int]$cur.monitor.dataBits }
        if ($cur.monitor.stopBits) { $config.StopBits = $cur.monitor.stopBits }
        if ($cur.monitor.parity) { $config.Parity = [string]$cur.monitor.parity }
        if ($cur.monitor.newline) { $config.Newline = [string]$cur.monitor.newline }
    }

    if ($embedded -and $embedded.cache) {
        $script:cache = $embedded.cache
    }

    $configSource = "embedded"
    Write-Host "Config loaded (ArduFlux.json)"
} elseif (Test-Path $legacyConfigFile) {
    $script:cache = @{}
    $legacy = Get-Content $legacyConfigFile | ConvertFrom-Json
    $config = $defaultConfig
    if ($legacy.BoardFQBN) { $config.BoardFQBN = [string]$legacy.BoardFQBN }
    if ($legacy.Port) { $config.Port = [string]$legacy.Port }
    if ($legacy.BaudRate) { $config.BaudRate = [int]$legacy.BaudRate }
    $configSource = "legacy"
    Write-Host "Config loaded (upload_config.json)"
} else {
    $script:cache = @{}
    $config = $defaultConfig
    Write-Host "Using default config"
}

# 链节联动：上传时自动编译（必须在配置加载后执行）
if ($u -and (-not $c) -and $config.CompileBeforeUpload) {
    $doCompile = $true
    Write-Host "Compile-before-upload link is ENABLED — compiling first"
}

function Save-Config {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

    if ($configSource -eq "embedded") {
        $saveObj = @{
            schemaVersion = $embeddedSchemaVersion
            current = @{
                board = @{ name = $config.BoardName; fqbn = $config.BoardFQBN; compileArgs = @(); pinDefines = @{} }
                port = @{
                    address = $config.Port
                    auto = [bool]$config.PortAuto
                    lastSuccessfulAddress = $config.LastSuccessfulPort
                }
                build = @{ outputDir = $config.OutputDir; recentOutputDirs = @($config.RecentOutputDirs); sketchPath = $config.SketchPath; compileBeforeUpload = [bool]$config.CompileBeforeUpload; uploadThenMonitor = [bool]$config.UploadThenMonitor }
                monitor = @{
                    enabled = [bool]$config.MonitorEnabled
                    baudRate = [int]$config.BaudRate
                    dataBits = [int]$config.DataBits
                    stopBits = $config.StopBits
                    parity = $config.Parity
                    newline = $config.Newline
                }
            }
            profiles = $embeddedProfiles
            cache = $script:cache
        }
        $jsonText = $saveObj | ConvertTo-Json -Depth 20
        [System.IO.File]::WriteAllText($embeddedConfigFile, $jsonText, $utf8NoBom)
        Write-Host "Config saved (ArduFlux.json)"
        return
    }

    $legacyObj = @{
        BoardFQBN = $config.BoardFQBN
        Port = $config.Port
        BaudRate = [int]$config.BaudRate
    }
    $legacyJsonText = $legacyObj | ConvertTo-Json
    [System.IO.File]::WriteAllText($legacyConfigFile, $legacyJsonText, $utf8NoBom)
    Write-Host "Config saved (upload_config.json)"
}

function Save-Cache {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    if (Test-Path $embeddedConfigFile) {
        try {
            $jsonText = Get-Content $embeddedConfigFile -Raw
            $jsonObj = $jsonText | ConvertFrom-Json
            if (-not $jsonObj) { return }
            if ($jsonObj.PSObject.Properties.Name -contains "cache") {
                $jsonObj.cache = $script:cache
            } else {
                $jsonObj | Add-Member -MemberType NoteProperty -Name "cache" -Value $script:cache -Force
            }
            $newJson = $jsonObj | ConvertTo-Json -Depth 20
            [System.IO.File]::WriteAllText($embeddedConfigFile, $newJson, $utf8NoBom)
        } catch {
        }
    }
}

function Release-SerialPort {
    param([string]$port)
    Write-Host "Releasing serial port $port..."
    # Terminate all processes gracefully via WMI with exit code 0 to avoid
    # abnormal exit-code propagation within the same console host.
    $procList = Get-Process | Where-Object {
        $_.ProcessName -like "*arduino*" -or
        $_.ProcessName -like "*serial*" -or
        $_.MainWindowTitle -like "*monitor*"
    }
    foreach ($p in $procList) {
        try {
            $wmiProc = Get-WmiObject Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue
            if ($wmiProc) { $wmiProc.Terminate(0) | Out-Null }
        } catch {}
    }
    # Also terminate any other PowerShell processes running upload.ps1 for this project,
    # since Start-CustomMonitor holds the port open inside the PowerShell process itself.
    $targets = Get-Process powershell, pwsh -ErrorAction SilentlyContinue | Where-Object {
        try {
            if ($_.Id -eq $PID) { return $false }
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
            $cmd -like "*upload.ps1*" -and $cmd -like "*$projectRoot*"
        } catch { $false }
    }
    foreach ($p in $targets) {
        try {
            $wmiProc = Get-WmiObject Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue
            if ($wmiProc) { $wmiProc.Terminate(0) | Out-Null }
        } catch {}
    }
    Start-Sleep 3
}

function Reset-Esp32 {
    param([string]$port, [int]$baudRate = 115200)
    if (-not $port) { return $false }
    try {
        $serial = New-Object System.IO.Ports.SerialPort $port, $baudRate
        $serial.DtrEnable = $false
        $serial.RtsEnable = $false
        $serial.Open()
        Start-Sleep -Milliseconds 100
        $serial.RtsEnable = $true
        Start-Sleep -Milliseconds 100
        $serial.RtsEnable = $false
        Start-Sleep -Milliseconds 100
        $serial.Close()
        return $true
    } catch {
        return $false
    }
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Keyboard {
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
}
"@ -ErrorAction SilentlyContinue

function Start-CustomMonitor {
    param(
        [string]$port,
        [int]$baudRate = 115200,
        [switch]$resetOnOpen
    )
    $serial = $null
    try {
        $serial = New-Object System.IO.Ports.SerialPort($port, $baudRate)
        $serial.Parity = [System.IO.Ports.Parity]::None
        $serial.DataBits = 8
        $serial.StopBits = [System.IO.Ports.StopBits]::One
        $serial.Encoding = [System.Text.Encoding]::UTF8
        $serial.DtrEnable = $false
        $serial.RtsEnable = $false
        $serial.ReadTimeout = 100
        $serial.Open()
        if ($resetOnOpen) {
            Start-Sleep -Milliseconds 50
            $serial.RtsEnable = $true
            Start-Sleep -Milliseconds 100
            $serial.RtsEnable = $false
            Start-Sleep -Milliseconds 100
        }
        $escWasDown = $false
        while ($serial.IsOpen) {
            try {
                if ($null -ne ([Keyboard] -as [type])) {
                    $escState = [Keyboard]::GetAsyncKeyState(0x1B)
                    $escDown = ($escState -lt 0)
                    if ($escDown -and -not $escWasDown) {
                        $escWasDown = $true
                    }
                    if (-not $escDown -and $escWasDown) {
                        break
                    }
                }
                if ($serial.BytesToRead -gt 0) {
                    $text = $serial.ReadExisting()
                    if ($text) { Write-Host -NoNewline $text }
                } else {
                    Start-Sleep -Milliseconds 10
                }
            } catch {
                Start-Sleep -Milliseconds 10
            }
        }
    } finally {
        if ($serial -and $serial.IsOpen) {
            $serial.Close()
            $serial.Dispose()
        }
    }
}

function Get-AvailablePorts {
    $CACHE_TTL_SECONDS = 3600
    $now = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())

    if ($script:cache.ports -and $script:cache.ports.timestamp) {
        $age = $now - [int64]$script:cache.ports.timestamp
        if ($age -lt $CACHE_TTL_SECONDS) {
            $cachedItems = @($script:cache.ports.items)
            if ($cachedItems.Count -gt 0) {
                if ($script:debugMode) {
                    Write-Host "Using cached port list (cached ${age}s ago)"
                }
                return @($cachedItems | ForEach-Object {
                    $protocolLabel = ""
                    if ($_.protocolLabel) { $protocolLabel = [string]$_.protocolLabel }
                    elseif ($_.type) { $protocolLabel = [string]$_.type }
                    [pscustomobject]@{
                        Address = [string]$_.address
                        Label = [string]$_.label
                        Protocol = [string]$_.protocol
                        ProtocolLabel = $protocolLabel
                        IsUsb = $protocolLabel -match "USB"
                    }
                })
            }
        }
    }

    $jsonText = arduino-cli board list --format json
    $ports = @()

    if ($LASTEXITCODE -eq 0 -and $jsonText) {
        try {
            $jsonData = $jsonText | ConvertFrom-Json
            if ($jsonData.detected_ports) {
                foreach ($entry in $jsonData.detected_ports) {
                    if ($entry.port -and $entry.port.address) {
                        $protocolLabel = ""
                        if ($entry.port.protocol_label) {
                            $protocolLabel = [string]$entry.port.protocol_label
                        }
                        $ports += [pscustomobject]@{
                            Address = [string]$entry.port.address
                            Label = [string]$entry.port.label
                            Protocol = [string]$entry.port.protocol
                            ProtocolLabel = $protocolLabel
                            IsUsb = $protocolLabel -match "USB"
                        }
                    }
                }
            }
        } catch {
        }
    }

    if ($ports.Count -gt 0) {
        $script:cache.ports = [pscustomobject]@{
            items = @($ports | ForEach-Object {
                [pscustomobject]@{
                    address = $_.Address
                    label = $_.Label
                    protocol = $_.Protocol
                    type = $_.ProtocolLabel
                }
            })
            timestamp = $now
        }
        Save-Cache
        return $ports
    }

    $boardListOutput = arduino-cli board list
    $fallbackPorts = @()
    foreach ($line in ($boardListOutput -split "`r?`n")) {
        if ($line -match "(COM\d+)") {
            $fallbackPorts += [pscustomobject]@{
                Address = $matches[1]
                Label = $line
                Protocol = ""
                ProtocolLabel = ""
                IsUsb = ($line -match "USB")
            }
        }
    }

    if ($fallbackPorts.Count -gt 0) {
        $script:cache.ports = [pscustomobject]@{
            items = @($fallbackPorts | ForEach-Object {
                [pscustomobject]@{
                    address = $_.Address
                    label = $_.Label
                    protocol = $_.Protocol
                    type = $_.ProtocolLabel
                }
            })
            timestamp = $now
        }
        Save-Cache
    }
    return $fallbackPorts
}

function Resolve-Port {
    param(
        [array]$Ports,
        [string]$SavedPort,
        [bool]$AutoSelect
    )

    if (-not $Ports -or $Ports.Count -eq 0) {
        return ""
    }

    $usbPorts = @($Ports | Where-Object { $_.IsUsb })
    $savedEntry = $Ports | Where-Object { $_.Address -eq $SavedPort } | Select-Object -First 1

    if ($AutoSelect) {
        $savedUsbEntry = $usbPorts | Where-Object { $_.Address -eq $SavedPort } | Select-Object -First 1
        if ($savedUsbEntry) {
            return $savedUsbEntry.Address
        }
        if ($usbPorts.Count -gt 0) {
            return $usbPorts[0].Address
        }
        if ($savedEntry) {
            return $savedEntry.Address
        }
        return $Ports[0].Address
    }

    if ($savedEntry) {
        return $savedEntry.Address
    }

    if ($usbPorts.Count -gt 0) {
        return $usbPorts[0].Address
    }

    return $Ports[0].Address
}

function Get-UploadCandidates {
    param(
        [array]$Ports,
        [string]$PrimaryPort,
        [bool]$AutoSelect
    )

    $ordered = New-Object System.Collections.Generic.List[string]

    if ($PrimaryPort) {
        [void]$ordered.Add($PrimaryPort)
    }

    if ($AutoSelect) {
        foreach ($port in ($Ports | Where-Object { $_.IsUsb })) {
            if (-not $ordered.Contains($port.Address)) {
                [void]$ordered.Add($port.Address)
            }
        }
    }

    foreach ($port in $Ports) {
        if (-not $ordered.Contains($port.Address)) {
            [void]$ordered.Add($port.Address)
        }
    }

    return @($ordered)
}

if ($doUpload -or $doMonitorBlock -or $forceMonitor) {
    if ($script:debugMode) {
        Write-Host "`n=== Finding available ports ==="
    }
    $availablePortObjects = @(Get-AvailablePorts)
    $availablePorts = @($availablePortObjects | ForEach-Object { $_.Address })

    if ($availablePorts.Count -eq 0) {
        Write-Host "No serial ports found. Please check device connection"
        exit 1
    }

    if ($script:debugMode) {
        Write-Host "Available ports:"
        $availablePortObjects | ForEach-Object {
            if ($_.IsUsb) {
                Write-Host "  - $($_.Address) [USB]"
            } else {
                Write-Host "  - $($_.Address)"
            }
        }
    }

    if ($config.Port) {
        if ($script:debugMode) {
            Write-Host "Using saved port: $($config.Port)"
        }
    } else {
        $resolvedPort = Resolve-Port -Ports $availablePortObjects -SavedPort $config.Port -AutoSelect $config.PortAuto
        if (-not $resolvedPort) {
            Write-Host "Unable to resolve a valid serial port"
            exit 1
        }
        $config.Port = $resolvedPort
        $resolvedIsUsb = ($availablePortObjects | Where-Object { $_.Address -eq $resolvedPort } | Select-Object -First 1).IsUsb
        if ($script:debugMode) {
            if ($resolvedIsUsb) {
                Write-Host "Auto selected USB port: $($config.Port)"
            } else {
                Write-Host "Auto selected port: $($config.Port)"
            }
        }
    }
}

if (-not $sketchPath) {
    $sketchPath = $projectRoot
}
$inoFile = $null

if ($sketchPath) {
    $resolvedSketch = $sketchPath
    if (Test-Path $resolvedSketch) {
        $item = Get-Item -Path $resolvedSketch
        if ($item -is [System.IO.FileInfo] -and $item.Extension -eq '.ino') {
            $inoFile = $item
            $sketchPath = $item.DirectoryName
        } elseif ($item -is [System.IO.DirectoryInfo]) {
            $sketchPath = $item.FullName
            $inoFile = Get-ChildItem -Path $sketchPath -Filter "*.ino" | Select-Object -First 1
        }
    }
}

function Get-RequiredLibraries {
    param([string]$inoPath)

    $CACHE_TTL_SECONDS = 3600
    $now = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
    $inoHash = (Get-FileHash -Path $inoPath -Algorithm SHA256).Hash

    if ($script:cache.libraries -and $script:cache.libraries.timestamp) {
        $age = $now - [int64]$script:cache.libraries.timestamp
        $cachedHash = [string]$script:cache.libraries.inoHash
        if ($age -lt $CACHE_TTL_SECONDS -and $cachedHash -eq $inoHash) {
            $cachedItems = @($script:cache.libraries.items)
            if ($script:debugMode) {
                Write-Host "Using cached library list (cached ${age}s ago)"
            }
            return $cachedItems
        }
    }

    # 读取 .ino 文件中所有 #include <...>（尖括号形式通常表示外部库）
    $includes = Get-Content $inoPath | ForEach-Object {
        if ($_ -match '^\s*#include\s+<([^>]+)>') {
            $matches[1]
        }
    } | Select-Object -Unique

    # 系统/核心自带库头文件，不需要通过 arduino-cli lib install 安装
    $systemHeaders = @(
        "Arduino.h",
        "Wire.h", "SPI.h", "SoftwareSerial.h",
        "EEPROM.h", "FS.h", "SD.h", "SD_MMC.h", "SPIFFS.h", "LittleFS.h", "Preferences.h",
        "WiFi.h", "WiFiClient.h", "WiFiServer.h", "WiFiUdp.h",
        "WiFiClientSecure.h", "HTTPClient.h", "WebServer.h", "Update.h",
        "ESPmDNS.h", "ArduinoOTA.h",
        "BluetoothSerial.h",
        "BLEDevice.h", "BLEServer.h", "BLEUtils.h", "BLE2902.h",
        "BLERemoteCharacteristic.h", "BLERemoteService.h", "BLEDescriptor.h",
        "NimBLEDevice.h", "NimBLEServer.h", "NimBLEHIDDevice.h",
        "NimBLECharacteristic.h", "NimBLEAdvertising.h", "NimBLEConnInfo.h",
        "NimBLEClient.h", "NimBLEUUID.h", "NimBLEScan.h",
        "esp_sleep.h", "esp_wifi.h", "esp_timer.h", "esp_system.h",
        "driver/ledc.h", "driver/touch_sensor.h", "driver/gpio.h", "driver/adc.h", "driver/uart.h",
        "soc/rtc_cntl_reg.h", "rom/rtc.h", "hal/touch_sensor_types.h",
        "Ticker.h", "assert.h"
    )

    # 头文件 → Library Manager 库名映射（处理启发式规则失效的特殊情况）
    $libNameOverrides = @{
        "Adafruit_Sensor.h" = "Adafruit Unified Sensor"
        "BleGamepad.h"      = "ESP32-BLE-Gamepad"
    }

    $required = @()
    foreach ($header in $includes) {
        if ([string]::IsNullOrWhiteSpace($header)) { continue }
        if ($systemHeaders -contains $header) { continue }

        # 如果存在显式映射，直接使用
        if ($libNameOverrides.ContainsKey($header)) {
            $required += $libNameOverrides[$header]
            continue
        }

        # 去掉 .h 后缀得到库目录/名称候选
        $baseName = $header -replace '\.h$',''
        if ([string]::IsNullOrWhiteSpace($baseName)) { continue }

        # 如果项目本地已存在同名库文件夹，则视为本地库，跳过
        $localLibDir = Join-Path $projectRoot $baseName
        if (Test-Path $localLibDir -PathType Container) {
            continue
        }

        # 启发式：Arduino Library Manager 中的库名通常将下划线替换为空格
        $libName = $baseName -replace '_', ' '
        $required += $libName
    }

    $required = $required | Select-Object -Unique

    $script:cache.libraries = [pscustomobject]@{
        items = @($required)
        inoHash = $inoHash
        timestamp = $now
    }
    Save-Cache

    return $required
}

if ($doCompile) {
    if (-not $inoFile) {
        $inoFile = Get-ChildItem -Path $sketchPath -Filter "*.ino" | Select-Object -First 1
    }
    if (-not $inoFile) {
        Write-Host "Error: No .ino sketch file found in $sketchPath"
        exit 1
    }
    $requiredLibs = Get-RequiredLibraries -inoPath $inoFile.FullName

    $missingLibs = @()
    if ($requiredLibs.Count -gt 0) {
        $installedLibNames = @()
        try {
            $libListJson = arduino-cli lib list --format json
            if ($libListJson) {
                $libListData = $libListJson | ConvertFrom-Json
                $libsArray = @()
                if ($libListData.installed_libraries) {
                    $libsArray = @($libListData.installed_libraries)
                } elseif ($libListData -is [array]) {
                    $libsArray = @($libListData)
                }
                $installedLibNames = @($libsArray | ForEach-Object {
                    if ($_.library -and $_.library.name) { $_.library.name }
                    elseif ($_.name) { $_.name }
                })
            }
        } catch {
            $installedLibNames = @()
        }

        foreach ($lib in $requiredLibs) {
            if (-not ($installedLibNames -contains $lib)) {
                $missingLibs += $lib
            }
        }
    }

    if ($missingLibs.Count -gt 0) {
        Write-Host "`n=== Installing required libraries ==="
        foreach ($lib in $missingLibs) {
            Write-Host "Installing library: $lib"
            arduino-cli lib install "$lib"
        }
    } elseif ($requiredLibs.Count -gt 0) {
        Write-Host "`n=== All required libraries already installed ==="
    } else {
        Write-Host "`n=== No external libraries to install ==="
    }

    Write-Host "`n=== Compiling sketch ==="
    $compileJob = Start-Job -ArgumentList $config.BoardFQBN, $sketchPath, $config.OutputDir -ScriptBlock {
        param([string]$fqbn, [string]$path, [string]$outputDir)
        if ($outputDir) {
            $fullOutputDir = $outputDir
            if (-not [System.IO.Path]::IsPathRooted($fullOutputDir)) {
                $fullOutputDir = Join-Path $path $fullOutputDir
            }
            New-Item -ItemType Directory -Force -Path $fullOutputDir | Out-Null
            $output = (& arduino-cli compile --fqbn $fqbn --output-dir $fullOutputDir $path 2>&1 | Out-String)
        } else {
            $output = (& arduino-cli compile --fqbn $fqbn $path 2>&1 | Out-String)
        }
        [pscustomobject]@{
            ExitCode = [int]$LASTEXITCODE
            Output = $output
        }
    }

    $animationFrames = @(".   ", "..  ", "... ", "....", " ...", "  ..", "   .", "    ")
    $i = 0
    while ($compileJob.State -eq "Running") {
        Write-Host -NoNewline "`rCompiling $($animationFrames[$i])"
        $i = ($i + 1) % $animationFrames.Count
        Start-Sleep -Milliseconds 150
    }
    Write-Host -NoNewline "`rCompiling done.       `n"

    $compileResult = Receive-Job -Job $compileJob -Wait -AutoRemoveJob
    if ($compileResult -and $compileResult.Output) {
        $compileResult.Output | Write-Host
    }

    if (-not $compileResult -or $compileResult.ExitCode -ne 0) {
        Write-Host "Compilation failed"
        exit 1
    }
}

if ($doUpload) {
    Release-SerialPort -port $config.Port

    Write-Host "`n=== Uploading sketch ==="
    $uploadCandidates = @(Get-UploadCandidates -Ports $availablePortObjects -PrimaryPort $config.Port -AutoSelect $config.PortAuto)
    $retryCount = 0
    $maxRetries = $uploadCandidates.Count
    $uploadSuccess = $false

    while ($retryCount -lt $maxRetries -and -not $uploadSuccess) {
        $candidatePort = $uploadCandidates[$retryCount]
        if ($candidatePort -ne $config.Port) {
            Write-Host "Trying alternate port: $candidatePort"
        }
        $config.Port = $candidatePort
        $uploadCmd = @("upload", "-p", $config.Port, "--fqbn", $config.BoardFQBN)
        if ($config.UploadThenMonitor -and $config.BoardFQBN -match "esp32") {
            $customPattern = '--chip {build.mcu} --port "{serial.port}" --baud {upload.speed} {upload.flags} --before default-reset --after no-reset write-flash {upload.erase_cmd} -z --flash-mode keep --flash-freq keep --flash-size keep {build.bootloader_addr} "{build.path}/{build.project_name}.bootloader.bin" 0x8000 "{build.path}/{build.project_name}.partitions.bin" 0xe000 "{runtime.platform.path}/tools/partitions/boot_app0.bin" 0x10000 "{build.path}/{build.project_name}.bin" {upload.extra_flags}'
            $uploadCmd += @("--upload-property", "upload.pattern_args=$customPattern")
        }
        $uploadCmd += $sketchPath
        arduino-cli @uploadCmd
        if ($?) {
            $uploadSuccess = $true
            $config.LastSuccessfulPort = $config.Port
        } else {
            $retryCount++
            if ($retryCount -lt $maxRetries) {
                Write-Host "Upload failed on $($config.Port), retrying ($retryCount/$maxRetries)..."
                Release-SerialPort -port $config.Port
            }
        }
    }

    if (-not $uploadSuccess) {
        Write-Host "Upload failed after $maxRetries attempts"
        Write-Host "Please check if another program is using the serial port"
        exit 1
    }

    Save-Config
}

if ($doMonitorBlock -or $forceMonitor) {
    if ($config.MonitorEnabled -or $forceMonitor) {
        Write-Host "`n=== Opening serial monitor ==="
        Write-Host "Press Ctrl+C to exit monitor"
        if ($config.BoardFQBN -match "esp32") {
            # Use custom monitor for ESP32 to ensure reset and read happen on the same port handle,
            # eliminating the gap where output is lost between reset and monitor startup.
            # Reset when: monitor-only (-s), or upload+monitor where upload was skipped reset (uploadThenMonitor).
            $shouldReset = $forceMonitor -or ($doUpload -and $config.UploadThenMonitor)
            Start-CustomMonitor -port $config.Port -baudRate $config.BaudRate -resetOnOpen:$shouldReset
        } else {
            $monitorArgs = @("-p", $config.Port, "-c", "baudrate=$($config.BaudRate)")
            arduino-cli monitor @monitorArgs
        }
    } else {
        Write-Host "`n=== Serial monitor disabled ==="
    }
}

# Use [Environment]::Exit to bypass any PowerShell exit-code quirks caused by
# taskkill, Stop-Process, or $LASTEXITCODE leakage from sibling commands.
if ($doUpload -and -not $uploadSuccess) {
    [Environment]::Exit(1)
}
[Environment]::Exit(0)
