import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { spawn as cpSpawn, ChildProcess } from "child_process";
import {
  ConfigStore,
  recommendSerialPort,
  isUsbPort,
  buildCompileArgs,
  buildUploadArgs,
  buildMonitorArgs,
} from "./configStore";
import { ArduFluxConfig, DEFAULT_BOARD_CATALOG } from "./types";
import { startSseServer, startStdioServer } from "./mcp/transports";

export interface McpServerDeps {
  spawn?: typeof cpSpawn;
}

interface TaskRecord {
  id: string;
  type: "compile" | "upload" | "monitor";
  status: "running" | "completed" | "failed";
  exitCode: number | null;
  logs: string[];
  startTime: number;
}

export function createMcpServer(
  workspaceRoot: string,
  deps: McpServerDeps = {}
): McpServer {
  const spawn = deps.spawn ?? cpSpawn;
  const tasks = new Map<string, TaskRecord>();

  function startTask(
    type: "compile" | "upload" | "monitor",
    command: string,
    args: string[],
    cwd: string
  ): string {
    const id = randomUUID();
    const task: TaskRecord = {
      id,
      type,
      status: "running",
      exitCode: null,
      logs: [],
      startTime: Date.now(),
    };
    tasks.set(id, task);

    try {
      const proc = spawn(command, args, { cwd, shell: false });
      proc.stdout?.on("data", (data: Buffer) => {
        task.logs.push(data.toString());
      });
      proc.stderr?.on("data", (data: Buffer) => {
        task.logs.push(data.toString());
      });
      proc.on("close", (code) => {
        task.status = code === 0 ? "completed" : "failed";
        task.exitCode = code ?? -1;
      });
      proc.on("error", (err) => {
        task.status = "failed";
        task.exitCode = -1;
        task.logs.push(`[error] ${err.message}`);
      });
    } catch (err) {
      task.status = "failed";
      task.exitCode = -1;
      task.logs.push(`[error] ${err instanceof Error ? err.message : String(err)}`);
    }

    return id;
  }

  const server = new McpServer({
    name: "arduflux",
    version: "0.3.4",
  });

  server.registerTool(
    "arduflux_get_state",
    {
      description:
        "获取当前工作区的完整状态，包括配置、可用串口列表、推荐端口、板型目录",
    },
    async () => {
      const store = new ConfigStore(workspaceRoot);
      const config = await store.load();
      const ports = await store.getSerialPorts();
      const recommendedPort = recommendSerialPort(
        ports,
        config.current.port.address,
        config.current.port.auto
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              config,
              ports,
              board_catalog: DEFAULT_BOARD_CATALOG,
              recommended_port: recommendedPort,
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "arduflux_list_ports",
    {
      description: "强制刷新并返回当前可用串口列表",
    },
    async () => {
      const store = new ConfigStore(workspaceRoot);
      await store.load();
      store.clearSerialPortsCache();
      const ports = await store.getSerialPorts();
      const config = store.getData();
      const recommendedPort = recommendSerialPort(
        ports,
        config.current.port.address,
        config.current.port.auto
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ports,
              recommended_port: recommendedPort,
              usb_ports: ports.filter(isUsbPort).map((p) => p.address),
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "arduflux_validate_config",
    {
      description: "校验当前配置合法性（FQBN、端口、路径等）",
    },
    async () => {
      const store = new ConfigStore(workspaceRoot);
      await store.load();
      try {
        await store.validateAll();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ valid: true }),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ valid: false, message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  const SetConfigSchema = z.object({
    board_name: z.string().optional(),
    board_fqbn: z.string().optional(),
    board_compile_args: z.string().optional(),
    board_pin_defines: z.string().optional(),
    port_address: z.string().optional(),
    port_auto: z.boolean().optional(),
    build_output_dir: z.string().optional(),
    sketch_path: z.string().optional(),
    compile_before_upload: z.boolean().optional(),
    upload_then_monitor: z.boolean().optional(),
    monitor_baud_rate: z.number().optional(),
    monitor_data_bits: z.number().optional(),
    monitor_stop_bits: z.number().optional(),
    monitor_parity: z.string().optional(),
    monitor_newline: z.string().optional(),
  });

  server.registerTool(
    "arduflux_set_config",
    {
      description: "原子化更新 ArduFlux.json 的当前配置，未提供的字段保持原值",
      inputSchema: SetConfigSchema,
    },
    async (args) => {
      const store = new ConfigStore(workspaceRoot);
      const config = await store.load();

      const next: ArduFluxConfig = JSON.parse(JSON.stringify(config));
      if (args.board_name !== undefined) next.current.board.name = args.board_name;
      if (args.board_fqbn !== undefined) next.current.board.fqbn = args.board_fqbn;
      if (args.board_compile_args !== undefined) {
        next.current.board.compileArgs = args.board_compile_args
          .split(" ")
          .filter((s) => s.trim());
      }
      if (args.board_pin_defines !== undefined) {
        next.current.board.pinDefines = JSON.parse(args.board_pin_defines);
      }
      if (args.port_address !== undefined) {
        next.current.port.address = args.port_address;
      }
      if (args.port_auto !== undefined) next.current.port.auto = args.port_auto;
      if (args.build_output_dir !== undefined) {
        next.current.build.outputDir = args.build_output_dir;
      }
      if (args.sketch_path !== undefined) {
        next.current.build.sketchPath = args.sketch_path;
      }
      if (args.compile_before_upload !== undefined) {
        next.current.build.compileBeforeUpload = args.compile_before_upload;
      }
      if (args.upload_then_monitor !== undefined) {
        next.current.build.uploadThenMonitor = args.upload_then_monitor;
      }
      if (args.monitor_baud_rate !== undefined) {
        next.current.monitor.baudRate = args.monitor_baud_rate;
      }
      if (args.monitor_data_bits !== undefined) {
        next.current.monitor.dataBits = args.monitor_data_bits;
      }
      if (args.monitor_stop_bits !== undefined) {
        next.current.monitor.stopBits = args.monitor_stop_bits;
      }
      if (args.monitor_parity !== undefined) {
        next.current.monitor.parity = args.monitor_parity;
      }
      if (args.monitor_newline !== undefined) {
        next.current.monitor.newline = args.monitor_newline;
      }

      store.setData(next);
      if (next.current.build.outputDir) {
        store.setOutputDir(next.current.build.outputDir);
      }
      await store.validateAll();
      await store.save();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ saved: true }),
          },
        ],
      };
    }
  );

  const ApplyProfileSchema = z.object({
    name: z.string(),
  });

  server.registerTool(
    "arduflux_apply_profile",
    {
      description: "应用指定 Profile 到当前配置",
      inputSchema: ApplyProfileSchema,
    },
    async (args) => {
      const store = new ConfigStore(workspaceRoot);
      await store.load();
      store.applyProfile(args.name);
      await store.save();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              applied: true,
              profile_name: args.name,
            }),
          },
        ],
      };
    }
  );

  const CompileSchema = z.object({
    sketch_path: z.string().optional(),
  });

  server.registerTool(
    "arduflux_compile",
    {
      description: "编译 Sketch。这是一个长耗时任务，返回 taskId 后需轮询 arduflux_get_task_status",
      inputSchema: CompileSchema,
    },
    async (args) => {
      try {
        const store = new ConfigStore(workspaceRoot);
        const config = await store.load();
        const sketchPath = args.sketch_path ?? config.current.build.sketchPath ?? "";
        const cliArgs = buildCompileArgs({
          fqbn: config.current.board.fqbn,
          sketchPath,
          outputDir: config.current.build.outputDir,
          extraArgs: config.current.board.compileArgs,
        });

        const taskId = startTask("compile", "arduino-cli", cliArgs, workspaceRoot);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task_id: taskId, status: "running" }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  const UploadSchema = z.object({
    port: z.string().optional(),
    sketch_path: z.string().optional(),
  });

  server.registerTool(
    "arduflux_upload",
    {
      description: "上传固件到开发板。自动遵循配置中的 compile_before_upload 链节开关",
      inputSchema: UploadSchema,
    },
    async (args) => {
      const store = new ConfigStore(workspaceRoot);
      const config = await store.load();
      const port = args.port ?? config.current.port.address;
      const sketchPath = args.sketch_path ?? config.current.build.sketchPath ?? "";

      if (config.current.build.compileBeforeUpload) {
        const compileArgs = buildCompileArgs({
          fqbn: config.current.board.fqbn,
          sketchPath,
          outputDir: config.current.build.outputDir,
          extraArgs: config.current.board.compileArgs,
        });
        startTask("compile", "arduino-cli", compileArgs, workspaceRoot);
      }

      const uploadArgs = buildUploadArgs({
        port,
        fqbn: config.current.board.fqbn,
        sketchPath,
      });
      const taskId = startTask("upload", "arduino-cli", uploadArgs, workspaceRoot);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ task_id: taskId, status: "running" }),
          },
        ],
      };
    }
  );

  const GetTaskStatusSchema = z.object({
    task_id: z.string(),
  });

  server.registerTool(
    "arduflux_get_task_status",
    {
      description: "查询长耗时任务（compile / upload）的当前状态和输出日志",
      inputSchema: GetTaskStatusSchema,
    },
    async (args) => {
      const task = tasks.get(args.task_id);
      if (!task) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `任务 ${args.task_id} 不存在或已过期`,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              task_id: task.id,
              status: task.status,
              exit_code: task.exitCode,
              logs: task.logs,
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "arduflux_monitor",
    {
      description: "打开串口监视器。由于监视器是阻塞式终端操作，仅负责启动并返回终端信息",
    },
    async () => {
      const store = new ConfigStore(workspaceRoot);
      const config = await store.load();
      const port = config.current.port.address;
      if (!port) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "串口未选择，无法打开监视器" }),
            },
          ],
          isError: true,
        };
      }

      const args = buildMonitorArgs({
        port,
        fqbn: config.current.board.fqbn,
        baudRate: config.current.monitor.baudRate,
        dataBits: config.current.monitor.dataBits,
        stopBits: config.current.monitor.stopBits,
        parity: config.current.monitor.parity,
      });

      startTask("monitor", "arduino-cli", args, workspaceRoot);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              started: true,
              terminal_name: "ArduFlux Monitor",
              note: "监视器已在系统终端中打开",
            }),
          },
        ],
      };
    }
  );

  return server;
}

function parseCliArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      args[key] = value;
      if (value !== "true") {
        i++;
      }
    }
  }
  return args;
}

function findProjectRoot(startDir: string): string {
  let current = startDir;
  while (current) {
    const fs = require("fs");
    const path = require("path");
    if (fs.existsSync(path.join(current, "ArduFlux.json"))) {
      return current;
    }
    if (fs.existsSync(path.join(current, "*.ino"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return startDir;
}

/* istanbul ignore next */
if (require.main === module) {
  void (async () => {
    const args = parseCliArgs(process.argv.slice(2));
    const startDir = args.workspace || process.cwd();
    const workspaceRoot = findProjectRoot(startDir);
    const useSse = args.sse === "true" || (!args.sse && !args.stdio);
    const port = parseInt(args.port || "0", 10);

    const server = createMcpServer(workspaceRoot);

    if (useSse) {
      const { port: actualPort } = await startSseServer(server, port);
      // eslint-disable-next-line no-console
      console.error(
        `[arduflux-mcp] SSE server listening on http://127.0.0.1:${actualPort}`
      );
    } else {
      await startStdioServer(server);
    }
  })();
}
