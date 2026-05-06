import { expect } from "chai";
import { buildMonitorArgs, execFileText } from "../configStore";

describe("configStore.ts - 串口监视器功能", () => {
  describe("buildMonitorArgs", () => {
    it("应生成基本 monitor 参数（仅端口）", () => {
      const args = buildMonitorArgs({ port: "COM36" });
      expect(args).to.deep.equal(["monitor", "-p", "COM36"]);
    });

    it("应包含 FQBN 参数", () => {
      const args = buildMonitorArgs({ port: "COM36", fqbn: "esp32:esp32:esp32s3" });
      expect(args).to.include.members(["--fqbn", "esp32:esp32:esp32s3"]);
    });

    it("应包含波特率配置", () => {
      const args = buildMonitorArgs({ port: "COM36", baudRate: 115200 });
      expect(args).to.include.members(["--config", "baudrate=115200"]);
    });

    it("应包含数据位配置", () => {
      const args = buildMonitorArgs({ port: "COM36", dataBits: 8 });
      expect(args).to.include.members(["--config", "bits=8"]);
    });

    it("应包含停止位配置", () => {
      const args = buildMonitorArgs({ port: "COM36", stopBits: 1 });
      expect(args).to.include.members(["--config", "stop_bits=1"]);
    });

    it("parity=none 时不应生成 parity 配置", () => {
      const args = buildMonitorArgs({ port: "COM36", parity: "none" });
      expect(args).to.not.include.members(["--config", "parity=none"]);
    });

    it("parity=odd 时应包含 parity 配置", () => {
      const args = buildMonitorArgs({ port: "COM36", parity: "odd" });
      expect(args).to.include.members(["--config", "parity=odd"]);
    });

    it("应同时生成多组 --config", () => {
      const args = buildMonitorArgs({
        port: "COM36",
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "even"
      });
      expect(args.filter((a: string) => a === "--config").length).to.equal(4);
    });

    it("参数顺序应为 monitor -p <port> [ --fqbn <fqbn> ] [ --config ... ]", () => {
      const args = buildMonitorArgs({
        port: "COM36",
        fqbn: "esp32:esp32:esp32s3",
        baudRate: 115200
      });
      expect(args[0]).to.equal("monitor");
      expect(args[1]).to.equal("-p");
      expect(args[2]).to.equal("COM36");
      expect(args).to.include.members(["--fqbn", "esp32:esp32:esp32s3"]);
      expect(args).to.include.members(["--config", "baudrate=115200"]);
    });
  });

  describe("execFileText", () => {
    it("应能执行命令并返回 stdout", async () => {
      const result = await execFileText("node", ["-e", "console.log('hello')"]);
      expect(result.stdout.trim()).to.equal("hello");
      expect(result.exitCode).to.equal(0);
    });

    it("命令不存在时应返回非零 exitCode", async () => {
      const result = await execFileText("nonexistent_command_12345", []);
      expect(result.exitCode).to.not.equal(0);
    });
  });
});
