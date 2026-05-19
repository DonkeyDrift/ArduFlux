import { expect } from "chai";
import {
  CONFIG_FILE_NAME,
  DEFAULT_BOARD_CATALOG,
  createDefaultConfig
} from "../types";

describe("types.ts", () => {
  describe("CONFIG_FILE_NAME", () => {
    it("应为 ArduFlux.json", () => {
      expect(CONFIG_FILE_NAME).to.equal("ArduFlux.json");
    });
  });

  describe("createDefaultConfig()", () => {
    it("应返回 schemaVersion 为 1 的默认配置", () => {
      const config = createDefaultConfig();
      expect(config.schemaVersion).to.equal(1);
    });

    it("应包含 default profile", () => {
      const config = createDefaultConfig();
      expect(config.profiles).to.have.property("default");
      expect(config.profiles.default).to.deep.equal({});
    });

    it("默认板型应为 ESP32-S3 (Generic)", () => {
      const config = createDefaultConfig();
      expect(config.current.board.name).to.equal("ESP32-S3 (Generic)");
      expect(config.current.board.fqbn).to.equal("esp32:esp32:esp32s3");
    });

    it("默认串口应为空且启用自动选择", () => {
      const config = createDefaultConfig();
      expect(config.current.port.address).to.equal("");
      expect(config.current.port.auto).to.be.true;
    });

    it("默认编译上传链节应为断开", () => {
      const config = createDefaultConfig();
      expect(config.current.build.compileBeforeUpload).to.be.false;
    });

    it("默认上传监视器链节应为断开", () => {
      const config = createDefaultConfig();
      expect(config.current.build.uploadThenMonitor).to.be.false;
    });

    it("默认源码路径应为空", () => {
      const config = createDefaultConfig();
      expect(config.current.build.sketchPath).to.equal("");
    });

    it("默认监视器参数应正确", () => {
      const config = createDefaultConfig();
      const monitor = config.current.monitor;
      expect(monitor.enabled).to.be.true;
      expect(monitor.baudRate).to.equal(115200);
      expect(monitor.dataBits).to.equal(8);
      expect(monitor.stopBits).to.equal(1);
      expect(monitor.parity).to.equal("none");
      expect(monitor.newline).to.equal("CRLF");
    });

    it("应返回深拷贝，修改不影响默认值", () => {
      const a = createDefaultConfig();
      const b = createDefaultConfig();
      a.current.board.name = "Modified";
      expect(b.current.board.name).to.equal("ESP32-S3 (Generic)");
    });
  });

  describe("DEFAULT_BOARD_CATALOG", () => {
    it("应至少包含 ESP32-S3、ESP32 Dev、Arduino Uno", () => {
      const names = DEFAULT_BOARD_CATALOG.map((b) => b.name);
      expect(names).to.include("ESP32-S3 (Generic)");
      expect(names).to.include("ESP32 Dev Module");
      expect(names).to.include("Arduino Uno");
    });

    it("每个预置板型都应具备 name、fqbn、compileArgs、pinDefines", () => {
      for (const item of DEFAULT_BOARD_CATALOG) {
        expect(item.name).to.be.a("string").and.not.empty;
        expect(item.compileArgs).to.be.an("array");
        expect(item.pinDefines).to.be.an("object");
      }
    });
  });
});
