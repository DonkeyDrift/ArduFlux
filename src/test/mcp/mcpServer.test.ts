import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import { ConfigStore } from "../../configStore";
import { createDefaultConfig } from "../../types";
import { createMcpServer } from "../../mcpServer";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  InitializeResultSchema,
  ListToolsResultSchema,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

async function initClient(server: ReturnType<typeof createMcpServer>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  await client.request(
    {
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    },
    InitializeResultSchema
  );
  await client.notification({ method: "notifications/initialized" });
  return client;
}

describe("MCP Server", () => {
  const workspaceRoot = "/project";
  let readFileStub: sinon.SinonStub;
  let writeFileStub: sinon.SinonStub;

  beforeEach(() => {
    readFileStub = sinon.stub(fs.promises, "readFile");
    writeFileStub = sinon.stub(fs.promises, "writeFile").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("createMcpServer", () => {
    it("应注册 arduflux_get_state tool 并可通过 MCP 协议访问", async () => {
      readFileStub.rejects(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      const server = createMcpServer(workspaceRoot);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();

      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });
      await client.connect(clientTransport);

      const initResult = await client.request(
        {
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
        InitializeResultSchema
      );
      expect(initResult.protocolVersion).to.be.a("string");

      await client.notification({
        method: "notifications/initialized",
      });

      const toolsResult = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      expect(toolsResult.tools).to.be.an("array");
      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).to.include("arduflux_get_state");
    });

    it("arduflux_get_state 应返回默认配置与板型目录", async () => {
      readFileStub.rejects(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );
      const originalGetSerialPorts = ConfigStore.prototype.getSerialPorts;
      ConfigStore.prototype.getSerialPorts = async function stubGetSerialPorts() {
        return [
          { address: "COM3", label: "COM3", protocol: "serial", type: "USB" },
        ];
      };

      try {
        const server = createMcpServer(workspaceRoot);
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);

        const client = new Client({
          name: "test-client",
          version: "1.0.0",
        });
        await client.connect(clientTransport);

        await client.request(
          {
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" },
            },
          },
          InitializeResultSchema
        );
        await client.notification({
          method: "notifications/initialized",
        });

        const result = await client.request(
          {
            method: "tools/call",
            params: {
              name: "arduflux_get_state",
              arguments: {},
            },
          },
          CallToolResultSchema
        );

        expect(result.content).to.be.an("array");
        expect(result.content).to.have.lengthOf(1);
        expect(result.content[0].type).to.equal("text");

        const textContent = result.content[0];
        expect(textContent.type).to.equal("text");
        const parsed = JSON.parse((textContent as { text: string }).text);
        expect(parsed).to.have.property("config");
        expect(parsed.config.current.board.name).to.equal("ESP32-S3 (Generic)");
        expect(parsed).to.have.property("ports");
        expect(parsed.ports).to.be.an("array");
        expect(parsed).to.have.property("board_catalog");
        expect(parsed.board_catalog).to.be.an("array");
        expect(parsed).to.have.property("recommended_port");
      } finally {
        ConfigStore.prototype.getSerialPorts = originalGetSerialPorts;
      }
    });

    it("arduflux_list_ports 应返回串口列表与推荐端口", async () => {
      readFileStub.rejects(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );
      const originalGetSerialPorts = ConfigStore.prototype.getSerialPorts;
      ConfigStore.prototype.getSerialPorts = async function stubGetSerialPorts() {
        return [
          { address: "COM3", label: "COM3", protocol: "serial", type: "USB" },
          { address: "COM1", label: "COM1", protocol: "serial", type: "" },
        ];
      };

      try {
        const server = createMcpServer(workspaceRoot);
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);

        const client = new Client({
          name: "test-client",
          version: "1.0.0",
        });
        await client.connect(clientTransport);

        await client.request(
          {
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" },
            },
          },
          InitializeResultSchema
        );
        await client.notification({
          method: "notifications/initialized",
        });

        const result = await client.request(
          {
            method: "tools/call",
            params: {
              name: "arduflux_list_ports",
              arguments: {},
            },
          },
          CallToolResultSchema
        );

        const textContent = result.content[0];
        expect(textContent.type).to.equal("text");
        const parsed = JSON.parse((textContent as { text: string }).text);

        expect(parsed.ports).to.be.an("array").with.lengthOf(2);
        expect(parsed.recommended_port).to.equal("COM3");
        expect(parsed.usb_ports).to.deep.equal(["COM3"]);
      } finally {
        ConfigStore.prototype.getSerialPorts = originalGetSerialPorts;
      }
    });

    it("arduflux_validate_config 应返回 valid: true 当配置合法", async () => {
      const validConfig = {
        schemaVersion: 1,
        current: {
          board: {
            name: "Custom",
            fqbn: "esp32:esp32:esp32s3",
            compileArgs: [],
            pinDefines: {},
          },
          port: { address: "COM3", auto: true, lastSuccessfulAddress: "" },
          build: {
            outputDir: "build",
            recentOutputDirs: [],
            sketchPath: "",
            compileBeforeUpload: false,
            uploadThenMonitor: false,
          },
          monitor: {
            enabled: true,
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            newline: "CRLF",
          },
        },
        profiles: { default: {} },
      };
      readFileStub.resolves(JSON.stringify(validConfig));
      const originalGetSerialPorts = ConfigStore.prototype.getSerialPorts;
      ConfigStore.prototype.getSerialPorts = async function stubGetSerialPorts() {
        return [
          { address: "COM3", label: "COM3", protocol: "serial", type: "USB" },
        ];
      };

      try {
        const server = createMcpServer(workspaceRoot);
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);

        const client = new Client({
          name: "test-client",
          version: "1.0.0",
        });
        await client.connect(clientTransport);

        await client.request(
          {
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" },
            },
          },
          InitializeResultSchema
        );
        await client.notification({
          method: "notifications/initialized",
        });

        const result = await client.request(
          {
            method: "tools/call",
            params: {
              name: "arduflux_validate_config",
              arguments: {},
            },
          },
          CallToolResultSchema
        );

        const textContent = result.content[0];
        expect(textContent.type).to.equal("text");
        const parsed = JSON.parse((textContent as { text: string }).text);
        expect(parsed.valid).to.equal(true);
      } finally {
        ConfigStore.prototype.getSerialPorts = originalGetSerialPorts;
      }
    });

    it("arduflux_validate_config 应返回 valid: false 当 FQBN 为空", async () => {
      const invalidConfig = {
        schemaVersion: 1,
        current: {
          board: {
            name: "Custom",
            fqbn: "",
            compileArgs: [],
            pinDefines: {},
          },
          port: { address: "COM3", auto: true, lastSuccessfulAddress: "" },
          build: {
            outputDir: "",
            recentOutputDirs: [],
            sketchPath: "",
            compileBeforeUpload: false,
            uploadThenMonitor: false,
          },
          monitor: {
            enabled: true,
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            newline: "CRLF",
          },
        },
        profiles: { default: {} },
      };
      readFileStub.resolves(JSON.stringify(invalidConfig));
      const originalGetSerialPorts = ConfigStore.prototype.getSerialPorts;
      ConfigStore.prototype.getSerialPorts = async function stubGetSerialPorts() {
        return [
          { address: "COM3", label: "COM3", protocol: "serial", type: "USB" },
        ];
      };

      try {
        const server = createMcpServer(workspaceRoot);
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);

        const client = new Client({
          name: "test-client",
          version: "1.0.0",
        });
        await client.connect(clientTransport);

        await client.request(
          {
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" },
            },
          },
          InitializeResultSchema
        );
        await client.notification({
          method: "notifications/initialized",
        });

        const result = await client.request(
          {
            method: "tools/call",
            params: {
              name: "arduflux_validate_config",
              arguments: {},
            },
          },
          CallToolResultSchema
        );

        const textContent = result.content[0];
        expect(textContent.type).to.equal("text");
        const parsed = JSON.parse((textContent as { text: string }).text);
        expect(parsed.valid).to.equal(false);
        expect(parsed.message).to.include("FQBN");
      } finally {
        ConfigStore.prototype.getSerialPorts = originalGetSerialPorts;
      }
    });

    it("arduflux_set_config 应更新配置并保存到 ArduFlux.json", async () => {
      const baseConfig = {
        schemaVersion: 1,
        current: {
          board: {
            name: "ESP32-S3 (Generic)",
            fqbn: "esp32:esp32:esp32s3",
            compileArgs: [],
            pinDefines: {},
          },
          port: { address: "COM3", auto: true, lastSuccessfulAddress: "" },
          build: {
            outputDir: "",
            recentOutputDirs: [],
            sketchPath: "",
            compileBeforeUpload: false,
            uploadThenMonitor: false,
          },
          monitor: {
            enabled: true,
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            newline: "CRLF",
          },
        },
        profiles: { default: {} },
      };
      readFileStub.resolves(JSON.stringify(baseConfig));
      const originalGetSerialPorts = ConfigStore.prototype.getSerialPorts;
      ConfigStore.prototype.getSerialPorts = async function stubGetSerialPorts() {
        return [
          { address: "COM3", label: "COM3", protocol: "serial", type: "USB" },
          { address: "COM5", label: "COM5", protocol: "serial", type: "USB" },
        ];
      };
      const written: string[] = [];
      writeFileStub.callsFake(async (_path: string, data: string) => {
        written.push(data);
        return Promise.resolve();
      });

      try {
      const server = createMcpServer(workspaceRoot);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });
      await client.connect(clientTransport);

      await client.request(
        {
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
        InitializeResultSchema
      );
      await client.notification({
        method: "notifications/initialized",
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_set_config",
            arguments: {
              board_name: "Custom Board",
              board_fqbn: "arduino:avr:uno",
              port_address: "COM5",
            },
          },
        },
        CallToolResultSchema
      );

      const textContent = result.content[0];
      expect(textContent.type).to.equal("text");
      const parsed = JSON.parse((textContent as { text: string }).text);
      expect(parsed.saved).to.equal(true);

      expect(written).to.have.lengthOf(1);
      const saved = JSON.parse(written[0]);
      expect(saved.current.board.name).to.equal("Custom Board");
      expect(saved.current.board.fqbn).to.equal("arduino:avr:uno");
      expect(saved.current.port.address).to.equal("COM5");
      } finally {
        ConfigStore.prototype.getSerialPorts = originalGetSerialPorts;
      }
    });

    it("arduflux_apply_profile 应应用指定 Profile", async () => {
      const configWithProfiles = {
        schemaVersion: 1,
        current: {
          board: {
            name: "ESP32-S3 (Generic)",
            fqbn: "esp32:esp32:esp32s3",
            compileArgs: [],
            pinDefines: {},
          },
          port: { address: "COM3", auto: true, lastSuccessfulAddress: "" },
          build: {
            outputDir: "",
            recentOutputDirs: [],
            sketchPath: "",
            compileBeforeUpload: false,
            uploadThenMonitor: false,
          },
          monitor: {
            enabled: true,
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: "none",
            newline: "CRLF",
          },
        },
        profiles: {
          default: {},
          dev: {
            board: { name: "Dev Board", fqbn: "arduino:avr:uno" },
          },
        },
      };
      readFileStub.resolves(JSON.stringify(configWithProfiles));
      const written: string[] = [];
      writeFileStub.callsFake(async (_path: string, data: string) => {
        written.push(data);
        return Promise.resolve();
      });

      const server = createMcpServer(workspaceRoot);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });
      await client.connect(clientTransport);

      await client.request(
        {
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
        InitializeResultSchema
      );
      await client.notification({
        method: "notifications/initialized",
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_apply_profile",
            arguments: {
              name: "dev",
            },
          },
        },
        CallToolResultSchema
      );

      const textContent = result.content[0];
      expect(textContent.type).to.equal("text");
      const parsed = JSON.parse((textContent as { text: string }).text);
      expect(parsed.applied).to.equal(true);
      expect(parsed.profile_name).to.equal("dev");

      expect(written).to.have.lengthOf(1);
      const saved = JSON.parse(written[0]);
      expect(saved.current.board.name).to.equal("Dev Board");
      expect(saved.current.board.fqbn).to.equal("arduino:avr:uno");
    });

    it("arduflux_compile 应启动后台任务并返回 task_id", async () => {
      readFileStub.rejects(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      const mockProc = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub(),
        kill: sinon.stub(),
        killed: false,
      };
      const mockSpawn = sinon.stub().returns(mockProc as unknown as cp.ChildProcess);

      const server = createMcpServer(workspaceRoot, { spawn: mockSpawn });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });
      await client.connect(clientTransport);

      await client.request(
        {
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
        InitializeResultSchema
      );
      await client.notification({
        method: "notifications/initialized",
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_compile",
            arguments: { sketch_path: "/project/ArduFlux.ino" },
          },
        },
        CallToolResultSchema
      );

      const textContent = result.content[0];
      expect(textContent.type).to.equal("text");
      const parsed = JSON.parse((textContent as { text: string }).text);
      expect(parsed.status).to.equal("running");
      expect(parsed.task_id).to.be.a("string");
    });

    it("arduflux_monitor 在 reset_on_connect=true 时应直接启动 monitor 且不禁用 DTR/RTS", async () => {
      const config = createDefaultConfig();
      config.current.port.address = "COM3";
      readFileStub.resolves(JSON.stringify(config));

      const mockProc = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub(),
        kill: sinon.stub(),
        killed: false,
      };
      const mockSpawn = sinon.stub().returns(mockProc as unknown as cp.ChildProcess);

      const server = createMcpServer(workspaceRoot, { spawn: mockSpawn });
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_monitor",
            arguments: { reset_on_connect: true },
          },
        },
        CallToolResultSchema
      );

      expect(mockSpawn.calledOnce).to.be.true;
      const spawnArgs = mockSpawn.firstCall.args[1] as string[];
      expect(mockSpawn.firstCall.args[0]).to.equal("arduino-cli");
      expect(spawnArgs).to.include("monitor");
      expect(spawnArgs).to.include("COM3");
      expect(spawnArgs).not.to.include("dtr=off");
      expect(spawnArgs).not.to.include("rts=off");

      const textContent = result.content[0];
      expect(textContent.type).to.equal("text");
      const parsed = JSON.parse((textContent as { text: string }).text);
      expect(parsed.started).to.equal(true);
      expect(parsed.reset_on_connect).to.equal(true);
      expect(parsed.note).to.include("不会在监听前预复位");
    });

    it("arduflux_monitor 在 reset_on_connect=false 时应禁用 DTR/RTS", async () => {
      const config = createDefaultConfig();
      config.current.port.address = "COM3";
      readFileStub.resolves(JSON.stringify(config));

      const mockProc = {
        stdout: { on: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub(),
        kill: sinon.stub(),
        killed: false,
      };
      const mockSpawn = sinon.stub().returns(mockProc as unknown as cp.ChildProcess);

      const server = createMcpServer(workspaceRoot, { spawn: mockSpawn });
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_monitor",
            arguments: { reset_on_connect: false },
          },
        },
        CallToolResultSchema
      );

      expect(mockSpawn.calledOnce).to.be.true;
      const spawnArgs = mockSpawn.firstCall.args[1] as string[];
      expect(spawnArgs).to.include("monitor");
      expect(spawnArgs).to.include.members(["--config", "dtr=off", "rts=off"]);

      const textContent = result.content[0];
      expect(textContent.type).to.equal("text");
      const parsed = JSON.parse((textContent as { text: string }).text);
      expect(parsed.started).to.equal(true);
      expect(parsed.reset_on_connect).to.equal(false);
    });

    it("arduflux_get_task_status 应返回任务状态与日志", async () => {
      readFileStub.rejects(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};
      const mockProc = {
        stdout: {
          on: (_event: string, handler: (...args: unknown[]) => void) => {
            (eventHandlers[_event] = eventHandlers[_event] || []).push(handler);
          },
        },
        stderr: {
          on: (_event: string, handler: (...args: unknown[]) => void) => {
            (eventHandlers[_event] = eventHandlers[_event] || []).push(handler);
          },
        },
        on: (_event: string, handler: (...args: unknown[]) => void) => {
          (eventHandlers[_event] = eventHandlers[_event] || []).push(handler);
        },
        kill: sinon.stub(),
        killed: false,
      };
      const mockSpawn = sinon.stub().returns(mockProc as unknown as cp.ChildProcess);

      const server = createMcpServer(workspaceRoot, { spawn: mockSpawn });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });
      await client.connect(clientTransport);

      await client.request(
        {
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
        InitializeResultSchema
      );
      await client.notification({
        method: "notifications/initialized",
      });

      const compileResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_compile",
            arguments: { sketch_path: "/project/ArduFlux.ino" },
          },
        },
        CallToolResultSchema
      );
      const taskId = JSON.parse((compileResult.content[0] as { text: string }).text).task_id;

      // Simulate process output
      eventHandlers["data"]?.forEach((h) => h(Buffer.from("Compiling...\n")));
      eventHandlers["close"]?.forEach((h) => h(0));

      const statusResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_get_task_status",
            arguments: { task_id: taskId },
          },
        },
        CallToolResultSchema
      );

      const textContent = statusResult.content[0];
      expect(textContent.type).to.equal("text");
      const parsed = JSON.parse((textContent as { text: string }).text);
      expect(parsed.task_id).to.equal(taskId);
      expect(parsed.status).to.equal("completed");
      expect(parsed.exit_code).to.equal(0);
      expect(parsed.logs).to.be.an("array");
    });

    it("arduflux_health 应返回运行时长、内存和活跃任务数", async () => {
      readFileStub.rejects(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      const server = createMcpServer(workspaceRoot);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });
      await client.connect(clientTransport);

      await client.request(
        {
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
        InitializeResultSchema
      );
      await client.notification({
        method: "notifications/initialized",
      });

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_health",
            arguments: {},
          },
        },
        CallToolResultSchema
      );

      const textContent = result.content[0];
      expect(textContent.type).to.equal("text");
      const parsed = JSON.parse((textContent as { text: string }).text);
      expect(parsed.uptime_seconds).to.be.a("number");
      expect(parsed.uptime_seconds).to.be.at.least(0);
      expect(parsed.memory).to.be.an("object");
      expect(parsed.memory.rss).to.be.a("number");
      expect(parsed.active_tasks).to.be.a("number");
    });

    it("arduflux_list_profiles 应返回所有 Profile 名称", async () => {
      readFileStub.resolves(
        JSON.stringify({
          schemaVersion: 1,
          current: createDefaultConfig(),
          profiles: { default: {}, dev: {}, prod: {} },
        })
      );

      const server = createMcpServer(workspaceRoot);
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: { name: "arduflux_list_profiles", arguments: {} },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.profiles).to.deep.equal(["default", "dev", "prod"]);
    });

    it("arduflux_save_profile 应保存当前配置为新 Profile", async () => {
      const defaultConfig = createDefaultConfig();
      readFileStub.resolves(JSON.stringify({ schemaVersion: 1, current: defaultConfig, profiles: { default: {} } }));

      const server = createMcpServer(workspaceRoot);
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: { name: "arduflux_save_profile", arguments: { name: "dev" } },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.saved).to.equal(true);
      expect(parsed.profile_name).to.equal("dev");
    });

    it("arduflux_save_profile 不应覆盖已有 Profile（除非 overwrite=true）", async () => {
      const defaultConfig = createDefaultConfig();
      readFileStub.resolves(JSON.stringify({ schemaVersion: 1, current: defaultConfig, profiles: { dev: {} } }));

      const server = createMcpServer(workspaceRoot);
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: { name: "arduflux_save_profile", arguments: { name: "dev" } },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.saved).to.equal(false);
      expect(result.isError).to.equal(true);
    });

    it("arduflux_delete_profile 应删除指定 Profile", async () => {
      const defaultConfig = createDefaultConfig();
      readFileStub.resolves(JSON.stringify({ schemaVersion: 1, current: defaultConfig, profiles: { default: {}, dev: {} } }));

      const server = createMcpServer(workspaceRoot);
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: { name: "arduflux_delete_profile", arguments: { name: "dev" } },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.deleted).to.equal(true);
      expect(parsed.profile_name).to.equal("dev");
    });

    it("arduflux_discover_sketches 应返回工作区中的 .ino 文件列表", async () => {
      readFileStub.rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const readdirStub = sinon.stub(fs.promises, "readdir");
      readdirStub.withArgs(workspaceRoot, { withFileTypes: true }).resolves([
        { name: "ArduFlux.ino", isFile: () => true, isDirectory: () => false } as any,
        { name: "src", isFile: () => false, isDirectory: () => true } as any,
      ]);
      readdirStub.withArgs(path.join(workspaceRoot, "src"), { withFileTypes: true }).resolves([
        { name: "Helper.ino", isFile: () => true, isDirectory: () => false } as any,
      ]);

      const server = createMcpServer(workspaceRoot);
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: { name: "arduflux_discover_sketches", arguments: {} },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.sketches).to.deep.equal([
        path.join(workspaceRoot, "ArduFlux.ino"),
        path.join(workspaceRoot, "src", "Helper.ino"),
      ]);

      readdirStub.restore();
    });

    it("arduflux_compile 在无 sketch_path 且只有一个 .ino 时应自动推断", async () => {
      readFileStub.rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const readdirStub = sinon.stub(fs.promises, "readdir");
      readdirStub.withArgs(workspaceRoot, { withFileTypes: true }).resolves([
        { name: "ArduFlux.ino", isFile: () => true, isDirectory: () => false } as any,
      ]);

      const server = createMcpServer(workspaceRoot);
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: { name: "arduflux_compile", arguments: {} },
        },
        CallToolResultSchema
      );

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.task_id).to.be.a("string");
      expect(parsed.sketch_path).to.equal(path.join(workspaceRoot, "ArduFlux.ino"));

      readdirStub.restore();
    });

    it("arduflux_compile 应拒绝恶意 FQBN", async () => {
      const maliciousConfig = createDefaultConfig();
      maliciousConfig.current.board.fqbn = "esp32:esp32;rm -rf /:esp32s3";
      readFileStub.resolves(JSON.stringify({ schemaVersion: 1, current: maliciousConfig.current, profiles: { default: {} } }));

      const server = createMcpServer(workspaceRoot);
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: { name: "arduflux_compile", arguments: { sketch_path: "/project/ArduFlux.ino" } },
        },
        CallToolResultSchema
      );

      expect(result.isError).to.equal(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).to.include("非法字符");
    });

    it("arduflux_set_config 应拒绝工作区外的 sketch_path", async () => {
      readFileStub.rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const server = createMcpServer(workspaceRoot);
      const client = await initClient(server);

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "arduflux_set_config",
            arguments: { sketch_path: "../evil.ino" },
          },
        },
        CallToolResultSchema
      );

      expect(result.isError).to.equal(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.saved).to.equal(false);
    });
  });
});
