import { expect } from "chai";

type ModuleWithLoad = typeof import("module") & {
  _load: (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
};

// statusBar.ts uses vscode.l10n.t(), so we stub the "vscode" module before
// requiring it, mirroring the pattern used in webviewView.test.ts.
const moduleLoader = require("module") as ModuleWithLoad;
const originalLoad = moduleLoader._load;

const fakeVscode = {
  l10n: {
    t: (message: string, ...args: string[]) =>
      message.replace(/\{(\d+)\}/g, (_match, index: string) => args[Number(index)] ?? "")
  }
};

moduleLoader._load = function patchedLoad(request: string, parent: NodeModule | undefined, isMain: boolean): unknown {
  if (request === "vscode") {
    return fakeVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { formatStatusBarText } = require("../statusBar") as typeof import("../statusBar");

moduleLoader._load = originalLoad;

describe("statusBar.ts", () => {
  describe("formatStatusBarText", () => {
    it("应显示板型名称和端口", () => {
      const text = formatStatusBarText("ESP32-S3 (Generic)", "COM36");
      expect(text).to.equal("ESP32-S3 (Generic) @ COM36");
    });

    it("端口为空时应显示「未选择端口」", () => {
      const text = formatStatusBarText("ESP32-S3 (Generic)", "");
      expect(text).to.equal("ESP32-S3 (Generic) @ No port selected");
    });

    it("板型名称为空时应显示「未配置板型」", () => {
      const text = formatStatusBarText("", "COM36");
      expect(text).to.equal("Board not configured @ COM36");
    });

    it("两者皆空时应显示「未配置」", () => {
      const text = formatStatusBarText("", "");
      expect(text).to.equal("Not configured");
    });

    it("应处理仅空白字符的板型名称", () => {
      const text = formatStatusBarText("   ", "COM36");
      expect(text).to.equal("Board not configured @ COM36");
    });

    it("应处理仅空白字符的端口", () => {
      const text = formatStatusBarText("ESP32-S3 (Generic)", "   ");
      expect(text).to.equal("ESP32-S3 (Generic) @ No port selected");
    });
  });
});
