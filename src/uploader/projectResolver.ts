import * as fs from "fs";
import * as path from "path";

export interface FsLike {
  existsSync(p: string): boolean;
  readdirSync(p: string): string[];
}

export function findProjectRoot(startDir: string, fsImpl: FsLike = fs): string {
  let current = path.resolve(startDir);

  while (true) {
    const configPath = path.join(current, "ArduFlux.json");
    if (fsImpl.existsSync(configPath)) {
      return current;
    }

    try {
      const entries = fsImpl.readdirSync(current);
      if (entries.some((entry) => entry.endsWith(".ino"))) {
        return current;
      }
    } catch {
      // ignore permission errors
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.resolve(startDir);
}
