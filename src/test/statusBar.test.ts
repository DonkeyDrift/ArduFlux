import { expect } from "chai";
import { formatStatusBarText } from "../statusBar";

describe("statusBar.ts", () => {
  describe("formatStatusBarText", () => {
    it("应显示板型名称和端口", () => {
      const text = formatStatusBarText("ESP32-S3 (Generic)", "COM36");
      expect(text).to.equal("ESP32-S3 (Generic) @ COM36");
    });

    it("端口为空时应显示「未选择端口」", () => {
      const text = formatStatusBarText("ESP32-S3 (Generic)", "");
      expect(text).to.equal("ESP32-S3 (Generic) @ 未选择端口");
    });

    it("板型名称为空时应显示「未配置板型」", () => {
      const text = formatStatusBarText("", "COM36");
      expect(text).to.equal("未配置板型 @ COM36");
    });

    it("两者皆空时应显示「未配置」", () => {
      const text = formatStatusBarText("", "");
      expect(text).to.equal("未配置");
    });

    it("应处理仅空白字符的板型名称", () => {
      const text = formatStatusBarText("   ", "COM36");
      expect(text).to.equal("未配置板型 @ COM36");
    });

    it("应处理仅空白字符的端口", () => {
      const text = formatStatusBarText("ESP32-S3 (Generic)", "   ");
      expect(text).to.equal("ESP32-S3 (Generic) @ 未选择端口");
    });
  });
});
