import { spawn as nodeSpawn } from "child_process";

export function getPowerShellExecutable(): string {
  return process.platform === "win32" ? "powershell.exe" : "pwsh";
}

export async function releaseSerialPort(
  port: string,
  spawnImpl: typeof nodeSpawn = nodeSpawn
): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const proc = spawnImpl("taskkill", ["/F", "/IM", "arduino-cli.exe"], { shell: false });
      proc.on("close", () => resolve());
      proc.on("error", () => resolve());
    });
  } else {
    await new Promise<void>((resolve) => {
      const proc = spawnImpl(
        "sh",
        ["-c", `fuser -k "${port}" 2>/dev/null || true`],
        { shell: false }
      );
      proc.on("close", () => resolve());
      proc.on("error", () => resolve());
    });
  }
}

export async function resetBoard(
  port: string,
  spawnImpl: typeof nodeSpawn = nodeSpawn
): Promise<void> {
  if (!port) {
    return;
  }
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const script = `
        try {
          $port = new-Object System.IO.Ports.SerialPort "${port}", 115200, None, 8, One
          $port.DtrEnable = $true
          $port.RtsEnable = $true
          $port.Open()
          Start-Sleep -Milliseconds 50
          $port.DtrEnable = $false
          $port.RtsEnable = $false
          $port.Close()
        } catch {
          # 忽略错误，端口可能被占用
        }
      `;
      const proc = spawnImpl("powershell.exe", ["-NoProfile", "-Command", script], { shell: false });
      proc.on("close", () => resolve());
      proc.on("error", () => resolve());
    });
  } else {
    await new Promise<void>((resolve) => {
      const proc = spawnImpl(
        "sh",
        ["-c", `stty -F "${port}" hupcl 2>/dev/null || stty -f "${port}" hupcl 2>/dev/null || true`],
        { shell: false }
      );
      proc.on("close", () => resolve());
      proc.on("error", () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
