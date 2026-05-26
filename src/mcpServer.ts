import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { spawn as cpSpawn, ChildProcess } from "child_process";
import * as path from "path";
import {
  ConfigStore,
  ValidationError,
  recommendSerialPort,
  isUsbPort,
  buildCompileArgs,
  buildUploadArgs,
  buildMonitorArgs,
  discoverSketches,
} from "./configStore";
import { ArduFluxConfig, DEFAULT_BOARD_CATALOG } from "./types";
import { compileSketchWithBackend, CompileResult } from "./uploader/compileBackend";
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
  metadata?: Record<string, unknown>;
}

export function createMcpServer(
  workspaceRoot: string,
  deps: McpServerDeps = {}
): McpServer {
  const spawn = deps.spawn ?? cpSpawn;
  const tasks = new Map<string, TaskRecord>();
  const startTime = Date.now();

  function startTask(
    type: "compile" | "upload" | "monitor",
    command: string,
    args: string[],
    cwd: string,
    sessionId?: string
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

    function pushLog(text: string): void {
      const line = text.trimEnd();
      task.logs.push(line);
      if (sessionId) {
        server.sendLoggingMessage({ level: "info", data: line }, sessionId).catch(() => {
          // ignore: client may not support logging
        });
      }
    }

    try {
      const proc = spawn(command, args, { cwd, shell: false });
      proc.stdout?.on("data", (data: Buffer) => {
        pushLog(data.toString());
      });
      proc.stderr?.on("data", (data: Buffer) => {
        pushLog(data.toString());
      });
      proc.on("close", (code, signal) => {
        if (code === 0) {
          task.status = "completed";
        } else if (signal) {
          task.status = "failed";
          pushLog(`[task] process terminated by signal ${signal}`);
        } else {
          task.status = "failed";
        }
        task.exitCode = code ?? -1;
      });
      proc.on("error", (err) => {
        task.status = "failed";
        task.exitCode = -1;
        pushLog(`[error] ${err.message}`);
      });
    } catch (err) {
      task.status = "failed";
      task.exitCode = -1;
      pushLog(`[error] ${err instanceof Error ? err.message : String(err)}`);
    }

    return id;
  }

  function runCommand(
    command: string,
    args: string[],
    cwd: string,
    pushLog: (text: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { cwd, shell: false });
      proc.stdout?.on("data", (data: Buffer) => pushLog(data.toString()));
      proc.stderr?.on("data", (data: Buffer) => pushLog(data.toString()));
      proc.on("close", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(signal ? `process terminated by signal ${signal}` : `${command} exited with code ${code ?? "unknown"}`));
      });
      proc.on("error", reject);
    });
  }

  function startAsyncTask(
    type: "compile" | "upload" | "monitor",
    runner: (pushLog: (text: string) => void) => Promise<Record<string, unknown> | void>,
    sessionId?: string
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

    function pushLog(text: string): void {
      const line = text.trimEnd();
      task.logs.push(line);
      if (sessionId) {
        server.sendLoggingMessage({ level: "info", data: line }, sessionId).catch(() => {
          // ignore: client may not support logging
        });
      }
    }

    runner(pushLog)
      .then((metadata) => {
        task.status = "completed";
        task.exitCode = 0;
        if (metadata) {
          task.metadata = metadata;
        }
      })
      .catch((error) => {
        task.status = "failed";
        task.exitCode = -1;
        pushLog(`[error] ${error instanceof Error ? error.message : String(error)}`);
      });

    return id;
  }

  const server = new McpServer({
    name: "arduflux",
    version: "0.4.3",
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
    monitor_reset_on_connect: z.boolean().optional(),
    wsl_enabled: z.boolean().optional(),
    wsl_distro: z.string().optional(),
    wsl_workspace_root: z.string().optional(),
    wsl_arduino_cli_path: z.string().optional(),
    wsl_sync_excludes: z.array(z.string()).optional(),
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
        const resolved = path.resolve(workspaceRoot, args.sketch_path);
        const rel = path.relative(workspaceRoot, resolved);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  saved: false,
                  error: `sketch_path 必须位于工作区内`,
                }),
              },
            ],
            isError: true,
          };
        }
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
      if (args.monitor_reset_on_connect !== undefined) {
        next.current.monitor.resetOnConnect = args.monitor_reset_on_connect;
      }
      if (args.wsl_enabled !== undefined) {
        next.current.wsl.enabled = args.wsl_enabled;
      }
      if (args.wsl_distro !== undefined) {
        next.current.wsl.distro = args.wsl_distro;
      }
      if (args.wsl_workspace_root !== undefined) {
        next.current.wsl.workspaceRoot = args.wsl_workspace_root;
      }
      if (args.wsl_arduino_cli_path !== undefined) {
        next.current.wsl.arduinoCliPath = args.wsl_arduino_cli_path;
      }
      if (args.wsl_sync_excludes !== undefined) {
        next.current.wsl.syncProject.excludes = args.wsl_sync_excludes;
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

  server.registerTool(
    "arduflux_list_profiles",
    {
      description: "列出当前所有可用的 Profile 名称",
    },
    async () => {
      const store = new ConfigStore(workspaceRoot);
      const config = await store.load();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              profiles: Object.keys(config.profiles),
            }),
          },
        ],
      };
    }
  );

  const SaveProfileSchema = z.object({
    name: z.string(),
    overwrite: z.boolean().optional(),
  });

  server.registerTool(
    "arduflux_save_profile",
    {
      description: "将当前配置保存为指定名称的 Profile",
      inputSchema: SaveProfileSchema,
    },
    async (args) => {
      const store = new ConfigStore(workspaceRoot);
      await store.load();
      if (!args.overwrite && store.getData().profiles[args.name]) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                saved: false,
                error: `Profile "${args.name}" 已存在，设置 overwrite=true 可覆盖`,
              }),
            },
          ],
          isError: true,
        };
      }
      store.saveProfile(args.name);
      await store.save();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ saved: true, profile_name: args.name }),
          },
        ],
      };
    }
  );

  const DeleteProfileSchema = z.object({
    name: z.string(),
  });

  server.registerTool(
    "arduflux_delete_profile",
    {
      description: "删除指定 Profile",
      inputSchema: DeleteProfileSchema,
    },
    async (args) => {
      const store = new ConfigStore(workspaceRoot);
      await store.load();
      store.deleteProfile(args.name);
      await store.save();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ deleted: true, profile_name: args.name }),
          },
        ],
      };
    }
  );

  const CompileSchema = z.object({
    sketch_path: z.string().optional(),
  });

  server.registerTool(
    "arduflux_discover_sketches",
    {
      description: "扫描工作区及子目录，自动发现所有 .ino Sketch 文件",
    },
    async () => {
      const sketches = await discoverSketches(workspaceRoot);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ sketches }),
          },
        ],
      };
    }
  );

  function compileMetadata(result: CompileResult, elapsedMs: number): Record<string, unknown> {
    return {
      backend: result.backend,
      wsl_distro: result.wslDistro,
      wsl_workspace: result.wslWorkspace,
      artifact_output_dir: result.artifactOutputDir,
      elapsed_ms: elapsedMs,
    };
  }

  async function resolveSketchPath(
    explicitPath: string | undefined,
    configPath: string
  ): Promise<string> {
    if (explicitPath) {
      return explicitPath;
    }
    if (configPath) {
      return configPath;
    }
    const sketches = await discoverSketches(workspaceRoot);
    if (sketches.length === 0) {
      throw new ValidationError("未找到 .ino 文件", "请指定 sketch_path 或在工作区中创建 .ino 文件");
    }
    if (sketches.length > 1) {
      throw new ValidationError(
        `发现多个 .ino 文件 (${sketches.length} 个)`,
        `请通过 sketch_path 指定其中一个：${sketches.join(", ")}`
      );
    }
    return sketches[0]!;
  }

  server.registerTool(
    "arduflux_compile",
    {
      description: "编译 Sketch。这是一个长耗时任务，返回 taskId 后需轮询 arduflux_get_task_status",
      inputSchema: CompileSchema,
    },
    async (args, extra) => {
      try {
        const store = new ConfigStore(workspaceRoot);
        const config = await store.load();
        const sketchPath = await resolveSketchPath(
          args.sketch_path,
          config.current.build.sketchPath
        );
        if (!config.current.wsl.enabled) {
          buildCompileArgs({
            fqbn: config.current.board.fqbn,
            sketchPath,
            outputDir: config.current.build.outputDir,
            extraArgs: config.current.board.compileArgs,
          }, workspaceRoot);
        } else {
          buildCompileArgs({
            fqbn: config.current.board.fqbn,
            sketchPath,
            outputDir: config.current.build.outputDir,
            extraArgs: config.current.board.compileArgs,
          });
        }
        const taskId = startAsyncTask("compile", async (pushLog) => {
          const startedAt = Date.now();
          const result = await compileSketchWithBackend({
            workspaceRoot,
            sketchPath,
            config: config.current,
            deps: { spawn },
            write: pushLog
          });
          return compileMetadata(result, Date.now() - startedAt);
        }, extra.sessionId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task_id: taskId,
                status: "running",
                sketch_path: sketchPath,
                backend: config.current.wsl.enabled ? "wsl" : "local",
                wsl_distro: config.current.wsl.enabled ? config.current.wsl.distro : undefined,
              }),
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
    async (args, extra) => {
      try {
        const store = new ConfigStore(workspaceRoot);
        const config = await store.load();
        const port = args.port ?? config.current.port.address;
        const sketchPath = await resolveSketchPath(
          args.sketch_path,
          config.current.build.sketchPath
        );

        const taskId = startAsyncTask("upload", async (pushLog) => {
          const startedAt = Date.now();
          let compileResult: CompileResult | undefined;
          if (config.current.build.compileBeforeUpload) {
            compileResult = await compileSketchWithBackend({
              workspaceRoot,
              sketchPath,
              config: config.current,
              deps: { spawn },
              write: pushLog
            });
          }

          const uploadArgs = buildUploadArgs({
            port,
            fqbn: config.current.board.fqbn,
            sketchPath,
            inputDir: compileResult?.artifactOutputDir,
          }, workspaceRoot);
          await runCommand("arduino-cli", uploadArgs, workspaceRoot, pushLog);

          return {
            ...(compileResult ? compileMetadata(compileResult, Date.now() - startedAt) : {}),
            elapsed_ms: Date.now() - startedAt,
          };
        }, extra.sessionId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task_id: taskId, status: "running", sketch_path: sketchPath }),
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
              metadata: task.metadata,
            }),
          },
        ],
      };
    }
  );

  const MonitorSchema = z.object({
    reset_on_connect: z.boolean().optional(),
  });

  server.registerTool(
    "arduflux_monitor",
    {
      description: "打开串口监视器。由于监视器是阻塞式终端操作，仅负责启动并返回终端信息",
      inputSchema: MonitorSchema,
    },
    async (args, extra) => {
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

      const resetOnConnect = args.reset_on_connect ?? config.current.monitor.resetOnConnect;

      const monitorArgs = buildMonitorArgs({
        port,
        fqbn: config.current.board.fqbn,
        baudRate: config.current.monitor.baudRate,
        dataBits: config.current.monitor.dataBits,
        stopBits: config.current.monitor.stopBits,
        parity: config.current.monitor.parity,
        resetOnConnect,
      });

      startTask("monitor", "arduino-cli", monitorArgs, workspaceRoot, extra.sessionId);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              started: true,
              terminal_name: "ArduFlux Monitor",
              reset_on_connect: resetOnConnect !== false,
              note: resetOnConnect === false
                ? "监视器已启动，并已禁用 DTR/RTS 复位；只会显示打开后产生的串口输出"
                : "监视器已启动；不会在监听前预复位，复位由 monitor 连接过程处理",
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "arduflux_health",
    {
      description: "获取服务器健康状态，包括运行时长、内存占用、活跃任务数",
    },
    async () => {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const mem = process.memoryUsage();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              uptime_seconds: uptime,
              memory: {
                rss: mem.rss,
                heap_used: mem.heapUsed,
                heap_total: mem.heapTotal,
                external: mem.external,
              },
              active_tasks: tasks.size,
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

function setupHealthPing(intervalSeconds: number): NodeJS.Timeout {
  const intervalMs = intervalSeconds * 1000;
  return setInterval(() => {
    // eslint-disable-next-line no-console
    console.error(`[arduflux-mcp] ping`);
  }, intervalMs);
}

function setupGlobalErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    const summary = {
      type: "uncaughtException",
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(summary));
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const summary = {
      type: "unhandledRejection",
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(summary));
    process.exit(1);
  });
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
    const healthInterval = parseInt(args["health-check-interval"] || "30", 10);

    setupGlobalErrorHandlers();

    const server = createMcpServer(workspaceRoot);

    if (useSse) {
      const { port: actualPort } = await startSseServer(server, port, () => createMcpServer(workspaceRoot));
      // eslint-disable-next-line no-console
      console.error(
        `[arduflux-mcp] SSE server listening on http://127.0.0.1:${actualPort}`
      );
    } else {
      const pingTimer = setupHealthPing(healthInterval);
      await startStdioServer(server);
      clearInterval(pingTimer);
    }
  })();
}
