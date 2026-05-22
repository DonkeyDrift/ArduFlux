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
