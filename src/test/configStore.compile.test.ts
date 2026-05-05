import { expect } from "chai";
import { buildCompileArgs, buildUploadArgs, ValidationError } from "../configStore";

describe("configStore.ts - 编译上传参数", () => {
  describe("buildCompileArgs", () => {
    it("应生成基本编译参数（fqbn + sketchPath）", () => {
      const args = buildCompileArgs({ fqbn: "esp32:esp32:esp32s3", sketchPath: "/project" });
      expect(args).to.deep.equal(["compile", "--fqbn", "esp32:esp32:esp32s3", "/project"]);
    });

    it("应包含 --output-dir 参数", () => {
      const args = buildCompileArgs({
        fqbn: "esp32:esp32:esp32s3",
        sketchPath: "/project",
        outputDir: "build"
      });
      expect(args).to.include.members(["--output-dir", "build"]);
    });

    it("应包含额外编译参数（extraArgs）", () => {
      const args = buildCompileArgs({
        fqbn: "esp32:esp32:esp32s3",
        sketchPath: "/project",
        extraArgs: ["--verbose", "--warnings", "all"]
      });
      expect(args).to.include.members(["--verbose", "--warnings", "all"]);
    });

    it("应同时包含 outputDir 和 extraArgs", () => {
      const args = buildCompileArgs({
        fqbn: "esp32:esp32:esp32s3",
        sketchPath: "/project",
        outputDir: "build",
        extraArgs: ["--verbose"]
      });
      expect(args[0]).to.equal("compile");
      expect(args).to.include.members(["--fqbn", "esp32:esp32:esp32s3"]);
      expect(args).to.include.members(["--output-dir", "build"]);
      expect(args).to.include.members(["--verbose"]);
      expect(args[args.length - 1]).to.equal("/project");
    });

    it("空 fqbn 应抛 ValidationError", () => {
      expect(() => buildCompileArgs({ fqbn: "", sketchPath: "/project" })).to.throw(
        ValidationError,
        "FQBN 不能为空"
      );
    });

    it("空 sketchPath 应抛 ValidationError", () => {
      expect(() => buildCompileArgs({ fqbn: "esp32:esp32:esp32s3", sketchPath: "" })).to.throw(
        ValidationError,
        "草图路径为空"
      );
    });

    it("参数顺序应为 compile --fqbn <fqbn> [ --output-dir <dir> ] [ extraArgs ] <sketchPath>", () => {
      const args = buildCompileArgs({
        fqbn: "arduino:avr:uno",
        sketchPath: "/workspace/sketch",
        outputDir: "out",
        extraArgs: ["--verbose"]
      });
      expect(args[0]).to.equal("compile");
      expect(args[1]).to.equal("--fqbn");
      expect(args[2]).to.equal("arduino:avr:uno");
      expect(args[args.length - 1]).to.equal("/workspace/sketch");
    });
  });

  describe("buildUploadArgs", () => {
    it("应生成基本上传参数（port + fqbn + sketchPath）", () => {
      const args = buildUploadArgs({ port: "COM36", fqbn: "esp32:esp32:esp32s3", sketchPath: "/project" });
      expect(args).to.deep.equal(["upload", "-p", "COM36", "--fqbn", "esp32:esp32:esp32s3", "/project"]);
    });

    it("空 port 应抛 ValidationError", () => {
      expect(() => buildUploadArgs({ port: "", fqbn: "esp32:esp32:esp32s3", sketchPath: "/project" })).to.throw(
        ValidationError,
        "串口未选择"
      );
    });

    it("空 fqbn 应抛 ValidationError", () => {
      expect(() => buildUploadArgs({ port: "COM36", fqbn: "", sketchPath: "/project" })).to.throw(
        ValidationError,
        "FQBN 不能为空"
      );
    });

    it("空 sketchPath 应抛 ValidationError", () => {
      expect(() => buildUploadArgs({ port: "COM36", fqbn: "esp32:esp32:esp32s3", sketchPath: "" })).to.throw(
        ValidationError,
        "草图路径为空"
      );
    });

    it("参数顺序应为 upload -p <port> --fqbn <fqbn> <sketchPath>", () => {
      const args = buildUploadArgs({ port: "/dev/ttyACM0", fqbn: "arduino:avr:uno", sketchPath: "/workspace" });
      expect(args[0]).to.equal("upload");
      expect(args[1]).to.equal("-p");
      expect(args[2]).to.equal("/dev/ttyACM0");
      expect(args[3]).to.equal("--fqbn");
      expect(args[4]).to.equal("arduino:avr:uno");
      expect(args[5]).to.equal("/workspace");
    });
  });
});
