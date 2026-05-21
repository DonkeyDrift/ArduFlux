import { expect } from "chai";
import * as sinon from "sinon";
import { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { startMcpSseServer } from "../../mcp/extensionIntegration";

describe("MCP Extension Integration", () => {
  it("应启动子进程并解析 SSE 端口", async () => {
    const stderrEmitter = new EventEmitter();
    const stdoutEmitter = new EventEmitter();
    const proc = Object.assign(new EventEmitter(), {
      stderr: stderrEmitter,
      stdout: stdoutEmitter,
      kill: sinon.stub(),
      pid: 12345,
    }) as unknown as ChildProcess;

    const mockSpawn = sinon.stub().returns(proc);

    const result = startMcpSseServer("/ext", "/workspace", {
      spawn: mockSpawn,
    });

    // Simulate server startup log on stderr
    stderrEmitter.emit(
      "data",
      Buffer.from("[arduflux-mcp] SSE server listening on http://127.0.0.1:9876\n")
    );

    const port = await result.port;
    expect(port).to.equal(9876);

    expect(mockSpawn.calledOnce).to.equal(true);
    const [command, args] = mockSpawn.firstCall.args;
    expect(command).to.equal("node");
    expect(args).to.include("--sse");
    expect(args).to.include("--workspace");
    expect(args).to.include("/workspace");
  });

  it("应在进程退出时拒绝端口 Promise", async () => {
    const proc = Object.assign(new EventEmitter(), {
      stderr: new EventEmitter(),
      stdout: new EventEmitter(),
      kill: sinon.stub(),
      pid: 12345,
    }) as unknown as ChildProcess;

    const mockSpawn = sinon.stub().returns(proc);

    const result = startMcpSseServer("/ext", "/workspace", {
      spawn: mockSpawn,
    });

    proc.emit("exit", 1);

    try {
      await result.port;
      expect.fail("应抛出错误");
    } catch (err) {
      expect((err as Error).message).to.include("exited with code 1");
    }
  });
});
