import * as path from "path";

export function toWslMountPath(windowsPath: string): string {
  const normalized = windowsPath.trim().replace(/\\/g, "/");
  const match = /^([A-Za-z]):\/?(.*)$/.exec(normalized);
  if (!match) {
    throw new Error(`无法转换为 WSL 挂载路径：${windowsPath}`);
  }

  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/^\/+/, "");
  return rest ? `/mnt/${drive}/${rest}` : `/mnt/${drive}`;
}

export function toPosixRelativePath(relativePath: string): string {
  return relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

export function sanitizeWslProjectName(name: string): string {
  const sanitized = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return sanitized || "arduflux-project";
}

export function joinWslPath(...parts: string[]): string {
  const cleaned = parts
    .map((part, index) => {
      const normalized = part.replace(/\\/g, "/");
      if (index === 0) {
        return normalized.replace(/\/+$/g, "");
      }
      return normalized.replace(/^\/+|\/+$/g, "");
    })
    .filter(Boolean);

  if (cleaned.length === 0) {
    return "";
  }

  return cleaned.join("/").replace(/\/+/g, "/");
}

export function parseSyncExcludes(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    for (const item of value.split(/[\n,]/)) {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }

  return result;
}

export function resolveWslWorkspaceRoot(configuredRoot: string, wslHome: string, windowsWorkspaceRoot: string): string {
  const configured = configuredRoot.trim();
  if (configured) {
    return configured.replace(/\\/g, "/").replace(/\/+$/g, "");
  }

  const home = wslHome.trim().startsWith("/") ? wslHome.trim() : "/home/arduflux";
  const projectName = sanitizeWslProjectName(path.basename(windowsWorkspaceRoot));
  return joinWslPath(home, "arduino-build", projectName);
}

export function buildWslCommandArgs(distro: string, commandArgs: string[]): string[] {
  const trimmedDistro = distro.trim();
  return trimmedDistro ? ["-d", trimmedDistro, "--", ...commandArgs] : ["--", ...commandArgs];
}
