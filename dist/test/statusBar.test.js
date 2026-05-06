"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const statusBar_1 = require("../statusBar");
describe("statusBar.ts", () => {
    describe("formatStatusBarText", () => {
        it("应显示板型名称和端口", () => {
            const text = (0, statusBar_1.formatStatusBarText)("ESP32-S3 (Generic)", "COM36");
            (0, chai_1.expect)(text).to.equal("ESP32-S3 (Generic) @ COM36");
        });
        it("端口为空时应显示「未选择端口」", () => {
            const text = (0, statusBar_1.formatStatusBarText)("ESP32-S3 (Generic)", "");
            (0, chai_1.expect)(text).to.equal("ESP32-S3 (Generic) @ 未选择端口");
        });
        it("板型名称为空时应显示「未配置板型」", () => {
            const text = (0, statusBar_1.formatStatusBarText)("", "COM36");
            (0, chai_1.expect)(text).to.equal("未配置板型 @ COM36");
        });
        it("两者皆空时应显示「未配置」", () => {
            const text = (0, statusBar_1.formatStatusBarText)("", "");
            (0, chai_1.expect)(text).to.equal("未配置");
        });
        it("应处理仅空白字符的板型名称", () => {
            const text = (0, statusBar_1.formatStatusBarText)("   ", "COM36");
            (0, chai_1.expect)(text).to.equal("未配置板型 @ COM36");
        });
        it("应处理仅空白字符的端口", () => {
            const text = (0, statusBar_1.formatStatusBarText)("ESP32-S3 (Generic)", "   ");
            (0, chai_1.expect)(text).to.equal("ESP32-S3 (Generic) @ 未选择端口");
        });
    });
});
//# sourceMappingURL=statusBar.test.js.map