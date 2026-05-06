"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const path = __importStar(require("path"));
const configStore_1 = require("../configStore");
describe("configStore.ts - 纯逻辑", () => {
    describe("ValidationError", () => {
        it("应保存 message 和 suggestion", () => {
            const err = new configStore_1.ValidationError("错误", "建议");
            (0, chai_1.expect)(err.message).to.equal("错误");
            (0, chai_1.expect)(err.suggestion).to.equal("建议");
            (0, chai_1.expect)(err.name).to.equal("ValidationError");
        });
        it("suggestion 可省略", () => {
            const err = new configStore_1.ValidationError("错误");
            (0, chai_1.expect)(err.suggestion).to.be.undefined;
        });
    });
    describe("deepClone", () => {
        it("应深拷贝对象", () => {
            const obj = { a: { b: 1 } };
            const cloned = (0, configStore_1.deepClone)(obj);
            (0, chai_1.expect)(cloned).to.deep.equal(obj);
            cloned.a.b = 2;
            (0, chai_1.expect)(obj.a.b).to.equal(1);
        });
        it("应深拷贝数组", () => {
            const arr = [1, [2, 3]];
            const cloned = (0, configStore_1.deepClone)(arr);
            (0, chai_1.expect)(cloned).to.deep.equal(arr);
            cloned[1][0] = 999;
            (0, chai_1.expect)(arr[1][0]).to.equal(2);
        });
    });
    describe("dedupeKeepLatest", () => {
        it("应去重并保留最新", () => {
            const result = (0, configStore_1.dedupeKeepLatest)(["a", "b", "a", "c"], 10);
            (0, chai_1.expect)(result).to.deep.equal(["b", "a", "c"]);
        });
        it("应限制数量", () => {
            const result = (0, configStore_1.dedupeKeepLatest)(["a", "b", "c", "d"], 2);
            (0, chai_1.expect)(result).to.deep.equal(["c", "d"]);
        });
        it("应过滤空字符串", () => {
            const result = (0, configStore_1.dedupeKeepLatest)(["a", "", "  ", "b"], 10);
            (0, chai_1.expect)(result).to.deep.equal(["a", "b"]);
        });
    });
    describe("normalizePath", () => {
        const base = "/project";
        it("应保留绝对路径", () => {
            const result = (0, configStore_1.normalizePath)("/absolute/path", base);
            (0, chai_1.expect)(result).to.equal(path.normalize("/absolute/path"));
        });
        it("应将相对路径解析为基于 baseDir 的绝对路径", () => {
            const result = (0, configStore_1.normalizePath)("relative/path", base);
            (0, chai_1.expect)(result).to.equal(path.resolve(base, "relative/path"));
        });
        it("应展开 Windows 环境变量", () => {
            process.env.TEST_VAR = "testvalue";
            const result = (0, configStore_1.normalizePath)("%TEST_VAR%/sub", base);
            (0, chai_1.expect)(result).to.equal(path.resolve(base, "testvalue/sub"));
            delete process.env.TEST_VAR;
        });
        it("空路径应抛 ValidationError", () => {
            (0, chai_1.expect)(() => (0, configStore_1.normalizePath)("", base)).to.throw(configStore_1.ValidationError, "路径为空");
        });
    });
    describe("validateFqbn", () => {
        it("合法 FQBN 应通过", () => {
            (0, chai_1.expect)(() => (0, configStore_1.validateFqbn)("esp32:esp32:esp32s3")).to.not.throw();
        });
        it("空 FQBN 应抛异常", () => {
            (0, chai_1.expect)(() => (0, configStore_1.validateFqbn)("")).to.throw(configStore_1.ValidationError, "FQBN 不能为空");
        });
        it("缺少冒号的 FQBN 应抛异常", () => {
            (0, chai_1.expect)(() => (0, configStore_1.validateFqbn)("esp32")).to.throw(configStore_1.ValidationError, "FQBN 格式不正确");
        });
        it("只有一个冒号的 FQBN 应抛异常", () => {
            (0, chai_1.expect)(() => (0, configStore_1.validateFqbn)("esp32:esp32")).to.throw(configStore_1.ValidationError, "FQBN 格式不正确");
        });
    });
    describe("isUsbPort", () => {
        it("应识别含 USB 的 label", () => {
            const port = { address: "COM3", label: "USB Serial", protocol: "", type: "" };
            (0, chai_1.expect)((0, configStore_1.isUsbPort)(port)).to.be.true;
        });
        it("应识别含 USB 的 protocol", () => {
            const port = { address: "COM3", label: "", protocol: "usb", type: "" };
            (0, chai_1.expect)((0, configStore_1.isUsbPort)(port)).to.be.true;
        });
        it("应识别含 USB 的 type", () => {
            const port = { address: "COM3", label: "", protocol: "", type: "USB" };
            (0, chai_1.expect)((0, configStore_1.isUsbPort)(port)).to.be.true;
        });
        it("非 USB 端口应返回 false", () => {
            const port = { address: "COM3", label: "Serial", protocol: "serial", type: "" };
            (0, chai_1.expect)((0, configStore_1.isUsbPort)(port)).to.be.false;
        });
    });
    describe("normalizeSerialAddress", () => {
        it("应将 com 小写转为大写", () => {
            (0, chai_1.expect)((0, configStore_1.normalizeSerialAddress)("com36")).to.equal("COM36");
        });
        it("COM 大写保持不变", () => {
            (0, chai_1.expect)((0, configStore_1.normalizeSerialAddress)("COM36")).to.equal("COM36");
        });
        it("非 COM 地址保持不变", () => {
            (0, chai_1.expect)((0, configStore_1.normalizeSerialAddress)("/dev/ttyACM0")).to.equal("/dev/ttyACM0");
        });
    });
    describe("mapJsonPortEntry", () => {
        it("应处理字符串输入", () => {
            const result = (0, configStore_1.mapJsonPortEntry)("COM36");
            (0, chai_1.expect)(result).to.deep.equal({ address: "COM36", label: "", protocol: "", type: "" });
        });
        it("应处理对象输入", () => {
            const result = (0, configStore_1.mapJsonPortEntry)({ address: "COM36", label: "USB", protocol: "serial", protocol_label: "USB UART" });
            (0, chai_1.expect)(result).to.deep.equal({ address: "COM36", label: "USB", protocol: "serial", type: "USB UART" });
        });
        it("应处理嵌套 port 对象", () => {
            const result = (0, configStore_1.mapJsonPortEntry)({ port: { address: "COM36", label: "USB" } });
            (0, chai_1.expect)(result).to.deep.equal({ address: "COM36", label: "USB", protocol: "", type: "" });
        });
        it("无效输入应返回 undefined", () => {
            (0, chai_1.expect)((0, configStore_1.mapJsonPortEntry)(null)).to.be.undefined;
            (0, chai_1.expect)((0, configStore_1.mapJsonPortEntry)(123)).to.be.undefined;
            (0, chai_1.expect)((0, configStore_1.mapJsonPortEntry)({})).to.be.undefined;
        });
    });
    describe("recommendSerialPort", () => {
        const ports = [
            { address: "COM1", label: "Serial", protocol: "", type: "" },
            { address: "COM36", label: "USB Serial", protocol: "", type: "USB" }
        ];
        it("空列表应返回空串", () => {
            (0, chai_1.expect)((0, configStore_1.recommendSerialPort)([], "", true)).to.equal("");
        });
        it("autoSelect=true 且 saved 是 USB 时应返回 saved", () => {
            (0, chai_1.expect)((0, configStore_1.recommendSerialPort)(ports, "COM36", true)).to.equal("COM36");
        });
        it("autoSelect=true 且 saved 非 USB 时应优先返回第一个 USB", () => {
            (0, chai_1.expect)((0, configStore_1.recommendSerialPort)(ports, "COM1", true)).to.equal("COM36");
        });
        it("autoSelect=false 且 saved 存在时应返回 saved", () => {
            (0, chai_1.expect)((0, configStore_1.recommendSerialPort)(ports, "COM1", false)).to.equal("COM1");
        });
        it("autoSelect=false 且 saved 不存在时应返回第一个 USB", () => {
            (0, chai_1.expect)((0, configStore_1.recommendSerialPort)(ports, "COM99", false)).to.equal("COM36");
        });
        it("无 USB 时应返回第一个可用端口", () => {
            const noUsb = [{ address: "COM1", label: "Serial", protocol: "", type: "" }];
            (0, chai_1.expect)((0, configStore_1.recommendSerialPort)(noUsb, "", true)).to.equal("COM1");
        });
    });
});
//# sourceMappingURL=configStore.logic.test.js.map