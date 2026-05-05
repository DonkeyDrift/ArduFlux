#Requires -Version 5.1
<#
.SYNOPSIS
    Auto-uninstall old Embedded Board Config extension, install latest VSIX, and reload VS Code.

.DESCRIPTION
    Steps:
    1. Locate embedded-board-config-*.vsix in current directory
    2. Check if extension is installed, uninstall if exists
    3. Install the latest VSIX
    4. Reload VS Code window

.PARAMETER VsixPath
    Optional. Specify VSIX file path. Default: auto-match latest VSIX in current dir.

.EXAMPLE
    .\install-vsix.ps1
    .\install-vsix.ps1 -VsixPath .\embedded-board-config-0.2.0.vsix
#>
[CmdletBinding()]
param(
    [string]$VsixPath = ""
)

$ErrorActionPreference = "Stop"

$ExtensionId = "baoshan.embedded-board-config"
$VsixPattern = "embedded-board-config-*.vsix"

function Get-CodeCommand {
    $codeCmd = Get-Command "code" -ErrorAction SilentlyContinue
    if ($codeCmd -and $codeCmd.Source -and (Test-Path $codeCmd.Source)) {
        return $codeCmd.Source
    }
    $codeCmd = Get-Command "code.cmd" -ErrorAction SilentlyContinue
    if ($codeCmd -and $codeCmd.Source -and (Test-Path $codeCmd.Source)) {
        return $codeCmd.Source
    }

    $paths = @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd"
        "$env:ProgramFiles\Microsoft VS Code\bin\code.cmd"
        "$env:ProgramFiles(x86)\Microsoft VS Code\bin\code.cmd"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    throw "VS Code CLI (code) not found. Please ensure VS Code is installed and its bin directory is in PATH."
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

$CodeCli = Get-CodeCommand
Write-Host "VS Code CLI: $CodeCli" -ForegroundColor Cyan

$TargetVsix = Resolve-VsixPath -ExplicitPath $VsixPath
Write-Host "VSIX file  : $TargetVsix" -ForegroundColor Cyan

Write-Host "`n[1/3] Checking installed extensions..." -ForegroundColor Yellow
$installed = & $CodeCli --list-extensions 2>$null | Select-String -Pattern "^$([regex]::Escape($ExtensionId))$"
if ($installed) {
    Write-Host "Extension $ExtensionId found, uninstalling..." -ForegroundColor DarkYellow
    & $CodeCli --uninstall-extension $ExtensionId | Write-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Uninstall returned non-zero exit code, extension may not exist."
    }
} else {
    Write-Host "Extension not installed, skip uninstall." -ForegroundColor Green
}

Write-Host "`n[2/3] Installing VSIX..." -ForegroundColor Yellow
& $CodeCli --install-extension $TargetVsix | Write-Host
if ($LASTEXITCODE -ne 0) {
    throw "VSIX installation failed."
}

Write-Host "`n[3/3] Reloading VS Code window..." -ForegroundColor Yellow
& $CodeCli --reload-window | Write-Host

Write-Host "`nDone! Extension installed and window reloaded." -ForegroundColor Green
