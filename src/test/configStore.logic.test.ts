import { expect } from "chai";
import * as path from "path";
import {
  ValidationError,
  deepClone,
  dedupeKeepLatest,
  normalizePath,
  validateFqbn,
  isUsbPort,
  normalizeSerialAddress,
  mapJsonPortEntry,
  recommendSerialPort
} from "../configStore";
import type { SerialPortInfo } from "../types";

describe("configStore.ts - 纯逻辑", () => {
  describe("ValidationError", () => {
    it("应保存 message 和 suggestion", () => {
      const err = new ValidationError("错误", "建议");
      expect(err.message).to.equal("错误");
      expect(err.suggestion).to.equal("建议");
      expect(err.name).to.equal("ValidationError");
    });

    it("suggestion 可省略", () => {
      const err = new ValidationError("错误");
      expect(err.suggestion).to.be.undefined;
    });
  });

  describe("deepClone", () => {
    it("应深拷贝对象", () => {
      const obj = { a: { b: 1 } };
      const cloned = deepClone(obj);
      expect(cloned).to.deep.equal(obj);
      cloned.a.b = 2;
      expect(obj.a.b).to.equal(1);
    });

    it("应深拷贝数组", () => {
      const arr = [1, [2, 3]];
      const cloned = deepClone(arr);
      expect(cloned).to.deep.equal(arr);
      (cloned[1] as number[])[0] = 999;
      expect((arr[1] as number[])[0]).to.equal(2);
    });
  });

  describe("dedupeKeepLatest", () => {
    it("应去重并保留最新", () => {
      const result = dedupeKeepLatest(["a", "b", "a", "c"], 10);
      expect(result).to.deep.equal(["b", "a", "c"]);
    });

    it("应限制数量", () => {
      const result = dedupeKeepLatest(["a", "b", "c", "d"], 2);
      expect(result).to.deep.equal(["c", "d"]);
    });

    it("应过滤空字符串", () => {
      const result = dedupeKeepLatest(["a", "", "  ", "b"], 10);
      expect(result).to.deep.equal(["a", "b"]);
    });
  });

  describe("normalizePath", () => {
    const base = "/project";

    it("应保留绝对路径", () => {
      const result = normalizePath("/absolute/path", base);
      expect(result).to.equal(path.normalize("/absolute/path"));
    });

    it("应将相对路径解析为基于 baseDir 的绝对路径", () => {
      const result = normalizePath("relative/path", base);
      expect(result).to.equal(path.resolve(base, "relative/path"));
    });

    it("应展开 Windows 环境变量", () => {
      process.env.TEST_VAR = "testvalue";
      const result = normalizePath("%TEST_VAR%/sub", base);
      expect(result).to.equal(path.resolve(base, "testvalue/sub"));
      delete process.env.TEST_VAR;
    });

    it("空路径应抛 ValidationError", () => {
      expect(() => normalizePath("", base)).to.throw(ValidationError, "路径为空");
    });
  });

  describe("validateFqbn", () => {
    it("合法 FQBN 应通过", () => {
      expect(() => validateFqbn("esp32:esp32:esp32s3")).to.not.throw();
    });

    it("空 FQBN 应抛异常", () => {
      expect(() => validateFqbn("")).to.throw(ValidationError, "FQBN 不能为空");
    });

    it("缺少冒号的 FQBN 应抛异常", () => {
      expect(() => validateFqbn("esp32")).to.throw(ValidationError, "FQBN 格式不正确");
    });

    it("只有一个冒号的 FQBN 应抛异常", () => {
      expect(() => validateFqbn("esp32:esp32")).to.throw(ValidationError, "FQBN 格式不正确");
    });
  });

  describe("isUsbPort", () => {
    it("应识别含 USB 的 label", () => {
      const port: SerialPortInfo = { address: "COM3", label: "USB Serial", protocol: "", type: "" };
      expect(isUsbPort(port)).to.be.true;
    });

    it("应识别含 USB 的 protocol", () => {
      const port: SerialPortInfo = { address: "COM3", label: "", protocol: "usb", type: "" };
      expect(isUsbPort(port)).to.be.true;
    });

    it("应识别含 USB 的 type", () => {
      const port: SerialPortInfo = { address: "COM3", label: "", protocol: "", type: "USB" };
      expect(isUsbPort(port)).to.be.true;
    });

    it("非 USB 端口应返回 false", () => {
      const port: SerialPortInfo = { address: "COM3", label: "Serial", protocol: "serial", type: "" };
      expect(isUsbPort(port)).to.be.false;
    });
  });

  describe("normalizeSerialAddress", () => {
    it("应将 com 小写转为大写", () => {
      expect(normalizeSerialAddress("com36")).to.equal("COM36");
    });

    it("COM 大写保持不变", () => {
      expect(normalizeSerialAddress("COM36")).to.equal("COM36");
    });

    it("非 COM 地址保持不变", () => {
      expect(normalizeSerialAddress("/dev/ttyACM0")).to.equal("/dev/ttyACM0");
    });
  });

  describe("mapJsonPortEntry", () => {
    it("应处理字符串输入", () => {
      const result = mapJsonPortEntry("COM36");
      expect(result).to.deep.equal({ address: "COM36", label: "", protocol: "", type: "" });
    });

    it("应处理对象输入", () => {
      const result = mapJsonPortEntry({ address: "COM36", label: "USB", protocol: "serial", protocol_label: "USB UART" });
      expect(result).to.deep.equal({ address: "COM36", label: "USB", protocol: "serial", type: "USB UART" });
    });

    it("应处理嵌套 port 对象", () => {
      const result = mapJsonPortEntry({ port: { address: "COM36", label: "USB" } });
      expect(result).to.deep.equal({ address: "COM36", label: "USB", protocol: "", type: "" });
    });

    it("无效输入应返回 undefined", () => {
      expect(mapJsonPortEntry(null)).to.be.undefined;
      expect(mapJsonPortEntry(123)).to.be.undefined;
      expect(mapJsonPortEntry({})).to.be.undefined;
    });
  });

  describe("recommendSerialPort", () => {
    const ports: SerialPortInfo[] = [
      { address: "COM1", label: "Serial", protocol: "", type: "" },
      { address: "COM36", label: "USB Serial", protocol: "", type: "USB" }
    ];

    it("空列表应返回空串", () => {
      expect(recommendSerialPort([], "", true)).to.equal("");
    });

    it("autoSelect=true 且 saved 是 USB 时应返回 saved", () => {
      expect(recommendSerialPort(ports, "COM36", true)).to.equal("COM36");
    });

    it("autoSelect=true 且 saved 非 USB 时应优先返回第一个 USB", () => {
      expect(recommendSerialPort(ports, "COM1", true)).to.equal("COM36");
    });

    it("autoSelect=false 且 saved 存在时应返回 saved", () => {
      expect(recommendSerialPort(ports, "COM1", false)).to.equal("COM1");
    });

    it("autoSelect=false 且 saved 不存在时应返回第一个 USB", () => {
      expect(recommendSerialPort(ports, "COM99", false)).to.equal("COM36");
    });

    it("无 USB 时应返回第一个可用端口", () => {
      const noUsb: SerialPortInfo[] = [{ address: "COM1", label: "Serial", protocol: "", type: "" }];
      expect(recommendSerialPort(noUsb, "", true)).to.equal("COM1");
    });
  });
});
