import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { spawn as cpSpawn, ChildProcess } from "child_process";
import * as path from "path";
import * as l10n from "@vscode/l10n";
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
import { startSseServer, startStdioServer } from "./mcp/transports";

const mcpLocale = process.env.VSCODE_NLS_CONFIG
  ? (JSON.parse(process.env.VSCODE_NLS_CONFIG) as { locale?: string }).locale
  : (process.env.ARDUFLUX_LANG ?? "en");
if (mcpLocale?.toLowerCase().startsWith("zh")) {
  l10n.config({ uri: path.join(__dirname, "..", "l10n", "bundle.l10n.zh-cn.json") });
}

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

  const server = new McpServer({
    name: "arduflux",
    version: "0.4.3",
  });

  server.registerTool(
    "arduflux_get_state",
    {
      description: l10n.t(
        "Get the full state of the current workspace, including configuration, available serial ports, recommended port, and the board catalog"
      ),
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
      description: l10n.t("Force-refresh and return the list of currently available serial ports"),
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
      description: l10n.t("Validate the current configuration (FQBN, port, paths, etc.)"),
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
      description: l10n.t("Atomically update the current configuration in ArduFlux.json; fields not provided keep their existing value"),
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
                  error: l10n.t("sketch_path must be inside the workspace"),
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
      description: l10n.t("Apply the specified profile to the current configuration"),
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
      description: l10n.t("List the names of all currently available profiles"),
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
      description: l10n.t("Save the current configuration as a profile with the given name"),
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
                error: l10n.t('Profile "{0}" already exists; set overwrite=true to overwrite it', args.name),
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
      description: l10n.t("Delete the specified profile"),
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
      description: l10n.t("Scan the workspace and subdirectories to automatically discover all .ino sketch files"),
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
      throw new ValidationError(l10n.t("No .ino file found"), l10n.t("Please specify sketch_path or create a .ino file in the workspace"));
    }
    if (sketches.length > 1) {
      throw new ValidationError(
        l10n.t("Multiple .ino files found ({0})", String(sketches.length)),
        l10n.t("Please specify one via sketch_path: {0}", sketches.join(", "))
      );
    }
    return sketches[0]!;
  }

  server.registerTool(
    "arduflux_compile",
    {
      description: l10n.t("Compile the sketch. This is a long-running task; after it returns a taskId, poll arduflux_get_task_status"),
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
        const cliArgs = buildCompileArgs({
          fqbn: config.current.board.fqbn,
          sketchPath,
          outputDir: config.current.build.outputDir,
          extraArgs: config.current.board.compileArgs,
        }, workspaceRoot);

        const taskId = startTask("compile", "arduino-cli", cliArgs, workspaceRoot, extra.sessionId);
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

  const UploadSchema = z.object({
    port: z.string().optional(),
    sketch_path: z.string().optional(),
  });

  server.registerTool(
    "arduflux_upload",
    {
      description: l10n.t("Upload firmware to the board. Automatically honors the compile_before_upload toggle in the configuration"),
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

        if (config.current.build.compileBeforeUpload) {
          const compileArgs = buildCompileArgs({
            fqbn: config.current.board.fqbn,
            sketchPath,
            outputDir: config.current.build.outputDir,
            extraArgs: config.current.board.compileArgs,
          }, workspaceRoot);
          startTask("compile", "arduino-cli", compileArgs, workspaceRoot, extra.sessionId);
        }

        const uploadArgs = buildUploadArgs({
          port,
          fqbn: config.current.board.fqbn,
          sketchPath,
        }, workspaceRoot);
        const taskId = startTask("upload", "arduino-cli", uploadArgs, workspaceRoot, extra.sessionId);

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
      description: l10n.t("Query the current status and output logs of a long-running task (compile / upload)"),
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
                error: l10n.t("Task {0} does not exist or has expired", args.task_id),
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
      description: l10n.t("Open the serial monitor. Since the monitor is a blocking terminal operation, this only starts it and returns terminal information"),
    },
    async (extra) => {
      const store = new ConfigStore(workspaceRoot);
      const config = await store.load();
      const port = config.current.port.address;
      if (!port) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: l10n.t("No serial port selected; cannot open the monitor") }),
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

      startTask("monitor", "arduino-cli", args, workspaceRoot, extra.sessionId);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              started: true,
              terminal_name: "ArduFlux Monitor",
              note: l10n.t("The monitor has been opened in the system terminal"),
            }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "arduflux_health",
    {
      description: l10n.t("Get server health status, including uptime, memory usage, and active task count"),
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
