param(
    [switch]$c,
    [switch]$u,
    [switch]$s
)

$doCompile = $c -or (-not $c -and -not $u -and -not $s)
$doUpload = $u -or (-not $c -and -not $u -and -not $s)
$doMonitorBlock = (-not $c -and -not $u -and -not $s)
$forceMonitor = $s

$legacyConfigFile = Join-Path $PSScriptRoot "upload_config.json"
$embeddedConfigFile = Join-Path $PSScriptRoot "ArduFlux.json"

$defaultConfig = @{
    BoardName = "ESP32-S3 (Generic)"
    BoardFQBN = "esp32:esp32:esp32s3"
    Port = ""
    PortAuto = $true
    LastSuccessfulPort = ""
    OutputDir = ""
    RecentOutputDirs = @()
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
    }
    if ($cur.monitor) {
        if ($null -ne $cur.monitor.enabled) { $config.MonitorEnabled = [bool]$cur.monitor.enabled }
        if ($cur.monitor.baudRate) { $config.BaudRate = [int]$cur.monitor.baudRate }
        if ($cur.monitor.dataBits) { $config.DataBits = [int]$cur.monitor.dataBits }
        if ($cur.monitor.stopBits) { $config.StopBits = $cur.monitor.stopBits }
        if ($cur.monitor.parity) { $config.Parity = [string]$cur.monitor.parity }
        if ($cur.monitor.newline) { $config.Newline = [string]$cur.monitor.newline }
    }

    $configSource = "embedded"
    Write-Host "Config loaded (ArduFlux.json)"
} elseif (Test-Path $legacyConfigFile) {
    $legacy = Get-Content $legacyConfigFile | ConvertFrom-Json
    $config = $defaultConfig
    if ($legacy.BoardFQBN) { $config.BoardFQBN = [string]$legacy.BoardFQBN }
    if ($legacy.Port) { $config.Port = [string]$legacy.Port }
    if ($legacy.BaudRate) { $config.BaudRate = [int]$legacy.BaudRate }
    $configSource = "legacy"
    Write-Host "Config loaded (upload_config.json)"
} else {
    $config = $defaultConfig
    Write-Host "Using default config"
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
                build = @{ outputDir = $config.OutputDir; recentOutputDirs = @($config.RecentOutputDirs) }
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

function Release-SerialPort {
    param([string]$port)
    Write-Host "Releasing serial port $port..."
    Get-Process | Where-Object { 
        $_.ProcessName -like "*arduino*" -or 
        $_.ProcessName -like "*serial*" -or
        $_.MainWindowTitle -like "*monitor*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 2
}

function Get-AvailablePorts {
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
    Write-Host "`n=== Finding available ports ==="
    $availablePortObjects = @(Get-AvailablePorts)
    $availablePorts = @($availablePortObjects | ForEach-Object { $_.Address })

    if ($availablePorts.Count -eq 0) {
        Write-Host "No serial ports found. Please check device connection"
        exit 1
    }

    Write-Host "Available ports:"
    $availablePortObjects | ForEach-Object {
        if ($_.IsUsb) {
            Write-Host "  - $($_.Address) [USB]"
        } else {
            Write-Host "  - $($_.Address)"
        }
    }

    $resolvedPort = Resolve-Port -Ports $availablePortObjects -SavedPort $config.Port -AutoSelect $config.PortAuto
    if (-not $resolvedPort) {
        Write-Host "Unable to resolve a valid serial port"
        exit 1
    }

    if ($config.PortAuto) {
        $config.Port = $resolvedPort
        $resolvedIsUsb = ($availablePortObjects | Where-Object { $_.Address -eq $resolvedPort } | Select-Object -First 1).IsUsb
        if ($resolvedIsUsb) {
            Write-Host "Auto selected USB port: $($config.Port)"
        } else {
            Write-Host "Auto selected port: $($config.Port)"
        }
    } else {
        $config.Port = $resolvedPort
        Write-Host "Using saved port: $($config.Port)"
    }
}

$sketchPath = $PSScriptRoot

function Get-RequiredLibraries {
    param([string]$inoPath)

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

    $required = @()
    foreach ($header in $includes) {
        if ([string]::IsNullOrWhiteSpace($header)) { continue }
        if ($systemHeaders -contains $header) { continue }

        # 去掉 .h 后缀得到库目录/名称候选
        $baseName = $header -replace '\.h$',''
        if ([string]::IsNullOrWhiteSpace($baseName)) { continue }

        # 如果项目本地已存在同名库文件夹，则视为本地库，跳过
        $localLibDir = Join-Path $PSScriptRoot $baseName
        if (Test-Path $localLibDir -PathType Container) {
            continue
        }

        # 启发式：Arduino Library Manager 中的库名通常将下划线替换为空格
        $libName = $baseName -replace '_', ' '
        $required += $libName
    }

    return $required | Select-Object -Unique
}

if ($doCompile) {
    $inoFile = Get-ChildItem -Path $sketchPath -Filter "*.ino" | Select-Object -First 1
    if (-not $inoFile) {
        Write-Host "Error: No .ino sketch file found in $sketchPath"
        exit 1
    }
    $requiredLibs = Get-RequiredLibraries -inoPath $inoFile.FullName

    if ($requiredLibs.Count -gt 0) {
        Write-Host "`n=== Installing required libraries ==="
        foreach ($lib in $requiredLibs) {
            Write-Host "Installing library: $lib"
            arduino-cli lib install "$lib"
        }
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
        arduino-cli upload -p $config.Port --fqbn $config.BoardFQBN $sketchPath
        if ($LASTEXITCODE -eq 0) {
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
        arduino-cli monitor -p $config.Port -c baudrate=$($config.BaudRate)
    } else {
        Write-Host "`n=== Serial monitor disabled ==="
    }
}
