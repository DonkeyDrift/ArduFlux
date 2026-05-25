import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import { ConfigStore, ValidationError } from "../configStore";
import { createDefaultConfig } from "../types";

describe("ConfigStore", () => {
  const baseDir = "/project";
  let store: ConfigStore;
  let readFileStub: sinon.SinonStub;
  let writeFileStub: sinon.SinonStub;
  let mkdirStub: sinon.SinonStub;

  beforeEach(() => {
    store = new ConfigStore(baseDir);
    readFileStub = sinon.stub(fs.promises, "readFile");
    writeFileStub = sinon.stub(fs.promises, "writeFile").resolves();
    mkdirStub = sinon.stub(fs.promises, "mkdir").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("load", () => {
    it("文件不存在时应生成默认配置", async () => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      readFileStub.rejects(err);

      const data = await store.load();
      expect(data.schemaVersion).to.equal(1);
      expect(data.current.board.name).to.equal("ESP32-S3 (Generic)");
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
      expect(data.current.board.name).to.equal("Custom");
      expect(data.current.port.address).to.equal("COM36");
      expect(data.current.wsl.enabled).to.be.false;
      expect(data.current.wsl.arduinoCliPath).to.equal("arduino-cli");
      expect(data.profiles).to.have.property("dev");
    });

    it("应加载并补齐 WSL 配置", async () => {
      const config = createDefaultConfig();
      config.current.wsl = {
        enabled: true,
        distro: "Ubuntu",
        workspaceRoot: "/home/me/arduino-build/demo",
        arduinoCliPath: "~/bin/arduino-cli",
        syncProject: { excludes: [".git"] }
      };
      readFileStub.resolves(JSON.stringify(config));

      const data = await store.load();
      expect(data.current.wsl.enabled).to.be.true;
      expect(data.current.wsl.distro).to.equal("Ubuntu");
      expect(data.current.wsl.syncProject.excludes).to.deep.equal([".git"]);
    });

    it("缺失 WSL 子字段时应补齐默认值", async () => {
      const config = createDefaultConfig() as unknown as { current: { wsl: Partial<ReturnType<typeof createDefaultConfig>["current"]["wsl"]> } };
      config.current.wsl = { enabled: true };
      readFileStub.resolves(JSON.stringify(config));

      const data = await store.load();
      expect(data.current.wsl.enabled).to.be.true;
      expect(data.current.wsl.arduinoCliPath).to.equal("arduino-cli");
      expect(data.current.wsl.syncProject.excludes).to.deep.equal([".git", "node_modules", ".vscode", ".trae"]);
    });

    it("应保留配置中的 cache 字段", async () => {
      const configWithCache = {
        schemaVersion: 1,
        current: {
          board: { name: "Custom", fqbn: "a:b:c", compileArgs: [], pinDefines: {} },
          port: { address: "COM36", auto: false, lastSuccessfulAddress: "" },
          build: { outputDir: "build", recentOutputDirs: [] },
          monitor: { enabled: false, baudRate: 9600, dataBits: 8, stopBits: 1, parity: "even", newline: "LF" }
        },
        profiles: { default: {} },
        cache: {
          ports: {
            items: [{ address: "COM36", label: "COM36", protocol: "serial", type: "USB" }],
            timestamp: 1234567890
          },
          libraries: {
            items: ["FastLED"],
            inoHash: "abc123",
            timestamp: 1234567890
          }
        }
      };
      readFileStub.resolves(JSON.stringify(configWithCache));

      const data = await store.load();
      expect(data.cache).to.deep.equal(configWithCache.cache);
    });

    it("v0 配置应迁移为 v1 并保留 current", async () => {
      const oldConfig = {
        board: { name: "Old", fqbn: "x:y:z", compileArgs: [], pinDefines: {} },
        port: { address: "COM1", auto: true, lastSuccessfulAddress: "" }
      };
      readFileStub.resolves(JSON.stringify(oldConfig));

      const data = await store.load();
      expect(data.schemaVersion).to.equal(1);
      expect(data.current.board.name).to.equal("Old");
    });

    it("不支持的版本应抛 ValidationError", async () => {
      readFileStub.resolves(JSON.stringify({ schemaVersion: 99 }));
      try {
        await store.load();
        expect.fail("应抛出异常");
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect((error as ValidationError).message).to.match(/不支持的配置版本/);
      }
    });
  });

  describe("save", () => {
    it("应以格式化 JSON 写入文件", async () => {
      await store.save();
      expect(writeFileStub.calledOnce).to.be.true;
      const [, content] = writeFileStub.firstCall.args;
      const parsed = JSON.parse(content as string);
      expect(parsed.schemaVersion).to.equal(1);
    });

    it("保存时应保留 cache 字段", async () => {
      const configWithCache = {
        schemaVersion: 1,
        current: {
          board: { name: "Custom", fqbn: "a:b:c", compileArgs: [], pinDefines: {} },
          port: { address: "COM36", auto: false, lastSuccessfulAddress: "" },
          build: { outputDir: "build", recentOutputDirs: [] },
          monitor: { enabled: false, baudRate: 9600, dataBits: 8, stopBits: 1, parity: "even", newline: "LF" }
        },
        profiles: { default: {} },
        cache: {
          ports: {
            items: [{ address: "COM36", label: "COM36", protocol: "serial", type: "USB" }],
            timestamp: 1234567890
          }
        }
      };
      readFileStub.resolves(JSON.stringify(configWithCache));
      await store.load();
      await store.save();

      const [, content] = writeFileStub.lastCall.args;
      const parsed = JSON.parse(content as string);
      expect(parsed.cache).to.deep.equal(configWithCache.cache);
    });
  });

  describe("validateBoard", () => {
    it("合法 FQBN 应通过", () => {
      expect(() => store.validateBoard({ name: "Test", fqbn: "a:b:c", compileArgs: [], pinDefines: {} })).to.not.throw();
    });

    it("空 FQBN 应抛异常", () => {
      expect(() => store.validateBoard({ name: "Test", fqbn: "", compileArgs: [], pinDefines: {} })).to.throw(ValidationError);
    });
  });

  describe("validateMonitor", () => {
    it("禁用监视器时应直接通过", () => {
      expect(() =>
        store.validateMonitor({ enabled: false, baudRate: 0, dataBits: 0, stopBits: 0, parity: "", newline: "" })
      ).to.not.throw();
    });

    it("合法监视器参数应通过", () => {
      expect(() =>
        store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", newline: "CRLF" })
      ).to.not.throw();
    });

    it("波特率 <=0 应抛异常", () => {
      expect(() =>
        store.validateMonitor({ enabled: true, baudRate: 0, dataBits: 8, stopBits: 1, parity: "none", newline: "CRLF" })
      ).to.throw(ValidationError, "波特率不正确");
    });

    it("数据位非法应抛异常", () => {
      expect(() =>
        store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 4, stopBits: 1, parity: "none", newline: "CRLF" })
      ).to.throw(ValidationError, "数据位不正确");
    });

    it("停止位非法应抛异常", () => {
      expect(() =>
        store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 8, stopBits: 3, parity: "none", newline: "CRLF" })
      ).to.throw(ValidationError, "停止位不正确");
    });

    it("校验位非法应抛异常", () => {
      expect(() =>
        store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 8, stopBits: 1, parity: "invalid", newline: "CRLF" })
      ).to.throw(ValidationError, "校验位不正确");
    });

    it("换行符非法应抛异常", () => {
      expect(() =>
        store.validateMonitor({ enabled: true, baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none", newline: "UNKNOWN" })
      ).to.throw(ValidationError, "换行符不正确");
    });
  });

  describe("setOutputDir", () => {
    it("应设置输出目录并记录最近路径", () => {
      store.setOutputDir("build");
      const data = store.getData();
      expect(data.current.build.outputDir).to.equal("build");
      expect(data.current.build.recentOutputDirs).to.include.members([path.resolve(baseDir, "build")]);
    });

    it("recentOutputDirs 应去重且上限为 5", () => {
      store.setOutputDir("a");
      store.setOutputDir("b");
      store.setOutputDir("c");
      store.setOutputDir("d");
      store.setOutputDir("e");
      store.setOutputDir("f");
      const data = store.getData();
      expect(data.current.build.recentOutputDirs.length).to.equal(5);
    });
  });

  describe("Profile 管理", () => {
    beforeEach(async () => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      readFileStub.rejects(err);
      await store.load();
      store.setData(createDefaultConfig());
    });

    it("saveProfile 应保存当前配置", () => {
      store.saveProfile("dev");
      const data = store.getData();
      expect(data.profiles).to.have.property("dev");
      expect(data.profiles.dev).to.deep.equal(data.current);
    });

    it("saveProfile 空名称应抛异常", () => {
      expect(() => store.saveProfile("")).to.throw(ValidationError, "Profile 名称不能为空");
    });

    it("applyProfile 应应用已保存的配置", () => {
      store.saveProfile("dev");
      store.getData().current.board.name = "Changed";
      store.applyProfile("dev");
      const data = store.getData();
      expect(data.current.board.name).to.equal("ESP32-S3 (Generic)");
    });

    it("applyProfile 不存在的 Profile 应抛异常", () => {
      expect(() => store.applyProfile("nonexistent")).to.throw(ValidationError, "Profile 不存在");
    });

    it("deleteProfile 应删除指定 Profile", () => {
      store.saveProfile("dev");
      store.deleteProfile("dev");
      const data = store.getData();
      expect(data.profiles).to.not.have.property("dev");
    });

    it("deleteProfile 后应保留 default", () => {
      store.saveProfile("dev");
      store.deleteProfile("dev");
      store.deleteProfile("default");
      const data = store.getData();
      expect(data.profiles).to.have.property("default");
    });
  });

  describe("exportProfiles / importProfiles", () => {
    beforeEach(async () => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      readFileStub.rejects(err);
      await store.load();
      store.saveProfile("dev");
    });

    it("exportProfiles 应写出 profiles", async () => {
      await store.exportProfiles("/project/profiles.json");
      expect(writeFileStub.calledOnce).to.be.true;
      const [, content] = writeFileStub.lastCall.args;
      const parsed = JSON.parse(content as string);
      expect(parsed.profiles).to.have.property("dev");
    });

    it("importProfiles 合并模式应保留现有并导入新项", async () => {
      readFileStub.resolves(
        JSON.stringify({ profiles: { prod: {} } })
      );
      await store.importProfiles("new.json", true);
      const data = store.getData();
      expect(data.profiles).to.have.property("dev");
      expect(data.profiles).to.have.property("prod");
    });

    it("importProfiles 覆盖模式应替换现有", async () => {
      readFileStub.resolves(
        JSON.stringify({ profiles: { prod: {} } })
      );
      await store.importProfiles("new.json", false);
      const data = store.getData();
      expect(data.profiles).to.not.have.property("dev");
      expect(data.profiles).to.have.property("prod");
    });

    it("importProfiles 非法格式应抛异常", async () => {
      readFileStub.resolves(JSON.stringify({}));
      try {
        await store.importProfiles("bad.json", true);
        expect.fail("应抛出异常");
      } catch (error) {
        expect(error).to.be.instanceOf(ValidationError);
        expect((error as ValidationError).message).to.include("导入文件格式不正确");
      }
    });
  });
});
