#Requires -Version 5.1
<#
.SYNOPSIS
    Auto-uninstall old Embedded Board Config extension, install latest VSIX, and reload IDE window.

.DESCRIPTION
    Supports both TRAE IDE (trae) and VS Code (code) CLI.
    Priority: trae > code
    Steps:
    1. Locate embedded-board-config-*.vsix in current directory
    2. Check if extension is installed, uninstall if exists
    3. Install the latest VSIX
    4. Reload IDE window

.PARAMETER VsixPath
    Optional. Specify VSIX file path. Default: auto-match latest VSIX in current dir.

.PARAMETER Ide
    Optional. Force specific IDE CLI: "trae" or "code". Default: auto-detect.

.EXAMPLE
    .\install-vsix.ps1
    .\install-vsix.ps1 -VsixPath .\embedded-board-config-0.2.0.vsix
    .\install-vsix.ps1 -Ide trae
#>
[CmdletBinding()]
param(
    [string]$VsixPath = "",
    [ValidateSet("trae", "code")]
    [string]$Ide = ""
)

$ErrorActionPreference = "Stop"

$ExtensionId = "baoshan.embedded-board-config"
$VsixPattern = "embedded-board-config-*.vsix"

function Get-IdeCli {
    param([string]$ForceIde)

    # If user forces an IDE, only look for that one
    $searchOrder = if ($ForceIde) { @($ForceIde) } else { @("trae", "code") }

    foreach ($name in $searchOrder) {
        # Try PATH first
        $cmd = Get-Command "$name" -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
            return @{ Name = $name; Path = $cmd.Source }
        }
        $cmd = Get-Command "$name.cmd" -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
            return @{ Name = $name; Path = $cmd.Source }
        }

        # Common install directories
        $paths = @(
            "$env:LOCALAPPDATA\Programs\Trae\bin\$name.cmd"
            "$env:ProgramFiles\Trae\bin\$name.cmd"
            "$env:ProgramFiles(x86)\Trae\bin\$name.cmd"
            "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\$name.cmd"
            "$env:ProgramFiles\Microsoft VS Code\bin\$name.cmd"
            "$env:ProgramFiles(x86)\Microsoft VS Code\bin\$name.cmd"
        )
        foreach ($p in $paths) {
            if (Test-Path $p) {
                return @{ Name = $name; Path = $p }
            }
        }
    }

    $msg = if ($ForceIde) {
        "$ForceIde CLI not found. Please ensure $ForceIde is installed and its bin directory is in PATH."
    } else {
        "Neither TRAE (trae) nor VS Code (code) CLI found. Please ensure one of them is installed and its bin directory is in PATH."
    }
    throw $msg
}

function Resolve-VsixPath {
    param([string]$ExplicitPath)
    if ($ExplicitPath) {
        if (-not (Test-Path $ExplicitPath)) {
            throw "Specified VSIX not found: $ExplicitPath"
        }
        return (Resolve-Path $ExplicitPath).Path
    }
    $files = @(Get-ChildItem -Path $PSScriptRoot -Filter $VsixPattern | Sort-Object LastWriteTime -Descending)
    if ($files.Count -eq 0) {
        throw "No $VsixPattern found in current directory. Please run 'npm run package' first."
    }
    return $files[0].FullName
}

$CliInfo = Get-IdeCli -ForceIde $Ide
$CliName = $CliInfo.Name
$CliPath = $CliInfo.Path

Write-Host "IDE CLI    : $CliPath ($CliName)" -ForegroundColor Cyan

$TargetVsix = Resolve-VsixPath -ExplicitPath $VsixPath
Write-Host "VSIX file  : $TargetVsix" -ForegroundColor Cyan

Write-Host "`n[1/3] Checking installed extensions..." -ForegroundColor Yellow
$installed = & $CliPath --list-extensions 2>$null | Select-String -Pattern "^$([regex]::Escape($ExtensionId))$"
if ($installed) {
    Write-Host "Extension $ExtensionId found, uninstalling..." -ForegroundColor DarkYellow
    & $CliPath --uninstall-extension $ExtensionId | Write-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Uninstall returned non-zero exit code, extension may not exist."
    }
} else {
    Write-Host "Extension not installed, skip uninstall." -ForegroundColor Green
}

Write-Host "`n[2/3] Installing VSIX..." -ForegroundColor Yellow
& $CliPath --install-extension $TargetVsix | Write-Host
if ($LASTEXITCODE -ne 0) {
    throw "VSIX installation failed."
}

Write-Host "`n[3/3] Reloading $CliName window..." -ForegroundColor Yellow
& $CliPath --reload-window | Write-Host

Write-Host "`nDone! Extension installed and window reloaded." -ForegroundColor Green
