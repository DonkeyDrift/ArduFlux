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
const sinon = __importStar(require("sinon"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const configStore_1 = require("../configStore");
const types_1 = require("../types");
describe("ConfigStore", () => {
    const baseDir = "/project";
    let store;
    let readFileStub;
    let writeFileStub;
    let mkdirStub;
    beforeEach(() => {
        store = new configStore_1.ConfigStore(baseDir);
        readFileStub = sinon.stub(fs.promises, "readFile");
        writeFileStub = sinon.stub(fs.promises, "writeFile").resolves();
        mkdirStub = sinon.stub(fs.promises, "mkdir").resolves();
    });
    afterEach(() => {
        sinon.restore();
    });
    describe("load", () => {
        it("文件不存在时应生成默认配置", async () => {
            const err = new Error("ENOENT");
            err.code = "ENOENT";
            readFileStub.rejects(err);
            const data = await store.load();
            (0, chai_1.expect)(data.schemaVersion).to.equal(1);
            (0, chai_1.expect)(data.current.board.name).to.equal("ESP32-S3 (Generic)");
        });
        it("应加载合法配置", async () => {
            const config = {
                schemaVersion: 1,
                current: {
                    board: { name: "Custom", fqbn: "a:b:c", compileArgs: [], pinDefines: {} },
                    port: { address: "COM36", auto: false, lastSuccessfulAddress: "" },
                    build: { outputDir: "build", recentOutputDirs: [] },
                    monitor: { enabled: false, baudRate: 9600, dataBits: 8, stopBits: 1, parity: "even", newline: "LF" }
                },
                profiles: { default: {}, dev: {} }
            };
            readFileStub.resolves(JSON.stringify(config));
            const data = await store.load();
            (0, chai_1.expect)(data.current.board.name).to.equal("Custom");
            (0, chai_1.expect)(data.current.port.address).to.equal("COM36");
            (0, chai_1.expect)(data.profiles).to.have.property("dev");
        });
        it("v0 配置应迁移为 v1 并保留 current", async () => {
            const oldConfig = {
                board: { name: "Old", fqbn: "x:y:z", compileArgs: [], pinDefines: {} },
                port: { address: "COM1", auto: true, lastSuccessfulAddress: "" }
            };
            readFileStub.resolves(JSON.stringify(oldConfig));
            const data = await store.load();
            (0, chai_1.expect)(data.schemaVersion).to.equal(1);
            (0, chai_1.expect)(data.current.board.name).to.equal("Old");
        });
        it("不支持的版本应抛 ValidationError", async () => {
            readFileStub.resolves(JSON.stringify({ schemaVersion: 99 }));
            try {
                await store.load();
                chai_1.expect.fail("应抛出异常");
            }
            catch (error) {
                (0, chai_1.expect)(error).to.be.instanceOf(configStore_1.ValidationError);
                (0, chai_1.expect)(error.message).to.match(/不支持的配置版本/);
            }
        });
    });
    describe("save", () => {
        it("应以格式化 JSON 写入文件", async () => {
            await store.save();
            (0, chai_1.expect)(writeFileStub.calledOnce).to.be.true;
            const [, content] = writeFileStub.firstCall.args;
            const parsed = JSON.parse(content);
            (0, chai_1.expect)(parsed.schemaVersion).to.equal(1);
        });
    });
    describe("validateBoard", () => {
        it("合法 FQBN 应通过", () => {
            (0, chai_1.expect)(() => store.validateBoard({ name: "Test", fqbn: "a:b:c", compileArgs: [], pinDefines: {} })).to.not.throw();
        });
        it("空 FQBN 应抛异常", () => {
            (0, chai_1.expect)(() => store.validateBoard({ name: "Test", fqbn: "", compileArgs: [], pinDefines: {} })).to.throw(configStore_1.ValidationError);
        });
    });
    describe("validateMonitor", () => {
        it("禁用监视器时应直接通过", () => {
            (0, chai_1.expect)(() => store.validateMonitor({ enabled: false, baudRate: 0, dataBits: 0, stopBits: 0, parity: "", newline: "" })).to.not.throw();
        });
        it("合法监视器参数应通过", () => {
            (0, chai_1.expect)(() => store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", newline: "CRLF" })).to.not.throw();
        });
        it("波特率 <=0 应抛异常", () => {
            (0, chai_1.expect)(() => store.validateMonitor({ enabled: true, baudRate: 0, dataBits: 8, stopBits: 1, parity: "none", newline: "CRLF" })).to.throw(configStore_1.ValidationError, "波特率不正确");
        });
        it("数据位非法应抛异常", () => {
            (0, chai_1.expect)(() => store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 4, stopBits: 1, parity: "none", newline: "CRLF" })).to.throw(configStore_1.ValidationError, "数据位不正确");
        });
        it("停止位非法应抛异常", () => {
            (0, chai_1.expect)(() => store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 8, stopBits: 3, parity: "none", newline: "CRLF" })).to.throw(configStore_1.ValidationError, "停止位不正确");
        });
        it("校验位非法应抛异常", () => {
            (0, chai_1.expect)(() => store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 8, stopBits: 1, parity: "invalid", newline: "CRLF" })).to.throw(configStore_1.ValidationError, "校验位不正确");
        });
        it("换行符非法应抛异常", () => {
            (0, chai_1.expect)(() => store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", newline: "UNKNOWN" })).to.throw(configStore_1.ValidationError, "换行符不正确");
        });
    });
    describe("setOutputDir", () => {
        it("应设置输出目录并记录最近路径", () => {
            store.setOutputDir("build");
            const data = store.getData();
            (0, chai_1.expect)(data.current.build.outputDir).to.equal("build");
            (0, chai_1.expect)(data.current.build.recentOutputDirs).to.include.members([path.resolve(baseDir, "build")]);
        });
        it("recentOutputDirs 应去重且上限为 5", () => {
            store.setOutputDir("a");
            store.setOutputDir("b");
            store.setOutputDir("c");
            store.setOutputDir("d");
            store.setOutputDir("e");
            store.setOutputDir("f");
            const data = store.getData();
            (0, chai_1.expect)(data.current.build.recentOutputDirs.length).to.equal(5);
        });
    });
    describe("Profile 管理", () => {
        beforeEach(async () => {
            const err = new Error("ENOENT");
            err.code = "ENOENT";
            readFileStub.rejects(err);
            await store.load();
            store.setData((0, types_1.createDefaultConfig)());
        });
        it("saveProfile 应保存当前配置", () => {
            store.saveProfile("dev");
            const data = store.getData();
            (0, chai_1.expect)(data.profiles).to.have.property("dev");
            (0, chai_1.expect)(data.profiles.dev).to.deep.equal(data.current);
        });
        it("saveProfile 空名称应抛异常", () => {
            (0, chai_1.expect)(() => store.saveProfile("")).to.throw(configStore_1.ValidationError, "Profile 名称不能为空");
        });
        it("applyProfile 应应用已保存的配置", () => {
            store.saveProfile("dev");
            store.getData().current.board.name = "Changed";
            store.applyProfile("dev");
            const data = store.getData();
            (0, chai_1.expect)(data.current.board.name).to.equal("ESP32-S3 (Generic)");
        });
        it("applyProfile 不存在的 Profile 应抛异常", () => {
            (0, chai_1.expect)(() => store.applyProfile("nonexistent")).to.throw(configStore_1.ValidationError, "Profile 不存在");
        });
        it("deleteProfile 应删除指定 Profile", () => {
            store.saveProfile("dev");
            store.deleteProfile("dev");
            const data = store.getData();
            (0, chai_1.expect)(data.profiles).to.not.have.property("dev");
        });
        it("deleteProfile 后应保留 default", () => {
            store.saveProfile("dev");
            store.deleteProfile("dev");
            store.deleteProfile("default");
            const data = store.getData();
            (0, chai_1.expect)(data.profiles).to.have.property("default");
        });
    });
    describe("exportProfiles / importProfiles", () => {
        beforeEach(async () => {
            const err = new Error("ENOENT");
            err.code = "ENOENT";
            readFileStub.rejects(err);
            await store.load();
            store.saveProfile("dev");
        });
        it("exportProfiles 应写出 profiles", async () => {
            await store.exportProfiles("/project/profiles.json");
            (0, chai_1.expect)(writeFileStub.calledOnce).to.be.true;
            const [, content] = writeFileStub.lastCall.args;
            const parsed = JSON.parse(content);
            (0, chai_1.expect)(parsed.profiles).to.have.property("dev");
        });
        it("importProfiles 合并模式应保留现有并导入新项", async () => {
            readFileStub.resolves(JSON.stringify({ profiles: { prod: {} } }));
            await store.importProfiles("new.json", true);
            const data = store.getData();
            (0, chai_1.expect)(data.profiles).to.have.property("dev");
            (0, chai_1.expect)(data.profiles).to.have.property("prod");
        });
        it("importProfiles 覆盖模式应替换现有", async () => {
            readFileStub.resolves(JSON.stringify({ profiles: { prod: {} } }));
            await store.importProfiles("new.json", false);
            const data = store.getData();
            (0, chai_1.expect)(data.profiles).to.not.have.property("dev");
            (0, chai_1.expect)(data.profiles).to.have.property("prod");
        });
        it("importProfiles 非法格式应抛异常", async () => {
            readFileStub.resolves(JSON.stringify({}));
            try {
                await store.importProfiles("bad.json", true);
                chai_1.expect.fail("应抛出异常");
            }
            catch (error) {
                (0, chai_1.expect)(error).to.be.instanceOf(configStore_1.ValidationError);
                (0, chai_1.expect)(error.message).to.include("导入文件格式不正确");
            }
        });
    });
});
//# sourceMappingURL=configStore.store.test.js.map