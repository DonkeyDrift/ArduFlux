"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const configStore_1 = require("../configStore");
describe("configStore.ts - 编译上传参数", () => {
    describe("buildCompileArgs", () => {
        it("应生成基本编译参数（fqbn + sketchPath）", () => {
            const args = (0, configStore_1.buildCompileArgs)({ fqbn: "esp32:esp32:esp32s3", sketchPath: "/project" });
            (0, chai_1.expect)(args).to.deep.equal(["compile", "--fqbn", "esp32:esp32:esp32s3", "/project"]);
        });
        it("应包含 --output-dir 参数", () => {
            const args = (0, configStore_1.buildCompileArgs)({
                fqbn: "esp32:esp32:esp32s3",
                sketchPath: "/project",
                outputDir: "build"
            });
            (0, chai_1.expect)(args).to.include.members(["--output-dir", "build"]);
        });
        it("应包含额外编译参数（extraArgs）", () => {
            const args = (0, configStore_1.buildCompileArgs)({
                fqbn: "esp32:esp32:esp32s3",
                sketchPath: "/project",
                extraArgs: ["--verbose", "--warnings", "all"]
            });
            (0, chai_1.expect)(args).to.include.members(["--verbose", "--warnings", "all"]);
        });
        it("应同时包含 outputDir 和 extraArgs", () => {
            const args = (0, configStore_1.buildCompileArgs)({
                fqbn: "esp32:esp32:esp32s3",
                sketchPath: "/project",
                outputDir: "build",
                extraArgs: ["--verbose"]
            });
            (0, chai_1.expect)(args[0]).to.equal("compile");
            (0, chai_1.expect)(args).to.include.members(["--fqbn", "esp32:esp32:esp32s3"]);
            (0, chai_1.expect)(args).to.include.members(["--output-dir", "build"]);
            (0, chai_1.expect)(args).to.include.members(["--verbose"]);
            (0, chai_1.expect)(args[args.length - 1]).to.equal("/project");
        });
        it("空 fqbn 应抛 ValidationError", () => {
            (0, chai_1.expect)(() => (0, configStore_1.buildCompileArgs)({ fqbn: "", sketchPath: "/project" })).to.throw(configStore_1.ValidationError, "FQBN 不能为空");
        });
        it("空 sketchPath 应抛 ValidationError", () => {
            (0, chai_1.expect)(() => (0, configStore_1.buildCompileArgs)({ fqbn: "esp32:esp32:esp32s3", sketchPath: "" })).to.throw(configStore_1.ValidationError, "草图路径为空");
        });
        it("参数顺序应为 compile --fqbn <fqbn> [ --output-dir <dir> ] [ extraArgs ] <sketchPath>", () => {
            const args = (0, configStore_1.buildCompileArgs)({
                fqbn: "arduino:avr:uno",
                sketchPath: "/workspace/sketch",
                outputDir: "out",
                extraArgs: ["--verbose"]
            });
            (0, chai_1.expect)(args[0]).to.equal("compile");
            (0, chai_1.expect)(args[1]).to.equal("--fqbn");
            (0, chai_1.expect)(args[2]).to.equal("arduino:avr:uno");
            (0, chai_1.expect)(args[args.length - 1]).to.equal("/workspace/sketch");
        });
    });
    describe("buildUploadArgs", () => {
        it("应生成基本上传参数（port + fqbn + sketchPath）", () => {
            const args = (0, configStore_1.buildUploadArgs)({ port: "COM36", fqbn: "esp32:esp32:esp32s3", sketchPath: "/project" });
            (0, chai_1.expect)(args).to.deep.equal(["upload", "-p", "COM36", "--fqbn", "esp32:esp32:esp32s3", "/project"]);
        });
        it("空 port 应抛 ValidationError", () => {
            (0, chai_1.expect)(() => (0, configStore_1.buildUploadArgs)({ port: "", fqbn: "esp32:esp32:esp32s3", sketchPath: "/project" })).to.throw(configStore_1.ValidationError, "串口未选择");
        });
        it("空 fqbn 应抛 ValidationError", () => {
            (0, chai_1.expect)(() => (0, configStore_1.buildUploadArgs)({ port: "COM36", fqbn: "", sketchPath: "/project" })).to.throw(configStore_1.ValidationError, "FQBN 不能为空");
        });
        it("空 sketchPath 应抛 ValidationError", () => {
            (0, chai_1.expect)(() => (0, configStore_1.buildUploadArgs)({ port: "COM36", fqbn: "esp32:esp32:esp32s3", sketchPath: "" })).to.throw(configStore_1.ValidationError, "草图路径为空");
        });
        it("参数顺序应为 upload -p <port> --fqbn <fqbn> <sketchPath>", () => {
            const args = (0, configStore_1.buildUploadArgs)({ port: "/dev/ttyACM0", fqbn: "arduino:avr:uno", sketchPath: "/workspace" });
            (0, chai_1.expect)(args[0]).to.equal("upload");
            (0, chai_1.expect)(args[1]).to.equal("-p");
            (0, chai_1.expect)(args[2]).to.equal("/dev/ttyACM0");
            (0, chai_1.expect)(args[3]).to.equal("--fqbn");
            (0, chai_1.expect)(args[4]).to.equal("arduino:avr:uno");
            (0, chai_1.expect)(args[5]).to.equal("/workspace");
        });
    });
});
//# sourceMappingURL=configStore.compile.test.js.map