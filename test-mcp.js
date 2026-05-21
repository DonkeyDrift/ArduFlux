const { spawn } = require('child_process');
const path = require('path');

const workspaceRoot = path.resolve('.');
const proc = spawn('node', ['./dist/mcpServer.js', '--stdio', '--workspace', workspaceRoot], {
  cwd: workspaceRoot,
  shell: false
});

let idCounter = 1;
let buffer = '';
const pending = new Map();

function send(method, params) {
  const id = idCounter++;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc.stdin.write(msg);
  });
}

function notify(method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
  proc.stdin.write(msg);
}

proc.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method === 'notifications/message') {
        console.log('[LOG]', msg.params?.data);
      }
    } catch (e) {
      console.log('[RAW]', line);
    }
  }
});

proc.stderr.on('data', (data) => {
  console.log('[STDERR]', data.toString().trim());
});

proc.on('error', (err) => console.error('[PROC ERROR]', err));

async function main() {
  console.log('=== 1. Initialize ===');
  const initRes = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' }
  });
  console.log('Initialize response:', JSON.stringify(initRes, null, 2));

  notify('notifications/initialized', {});

  console.log('\n=== 2. Get State ===');
  const stateRes = await send('tools/call', {
    name: 'arduflux_get_state',
    arguments: {}
  });
  console.log('Get State response:', JSON.stringify(stateRes, null, 2));

  console.log('\n=== 3. Compile ===');
  const compileRes = await send('tools/call', {
    name: 'arduflux_compile',
    arguments: { sketch_path: './test/mus4/mus4.ino' }
  });
  console.log('Compile response:', JSON.stringify(compileRes, null, 2));
  
  if (compileRes.error) {
    console.log('❌ Compile failed (SDK error):', compileRes.error);
    proc.kill();
    return;
  }
  
  const compileText = compileRes.result?.content?.[0]?.text || '{}';
  let compileResult;
  try { compileResult = JSON.parse(compileText); } catch { compileResult = { raw: compileText }; }
  console.log('Parsed compile result:', JSON.stringify(compileResult, null, 2));
  
  if (compileResult.error) {
    console.log('❌ Compile failed:', compileResult.error);
    proc.kill();
    return;
  }

  const taskId = compileResult.task_id;
  console.log('Task ID:', taskId);

  // Poll task status (5s interval, up to 180 times = 15 min max)
  let taskDone = false;
  let lastLogCount = 0;
  for (let i = 0; i < 180 && !taskDone; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await send('tools/call', {
      name: 'arduflux_get_task_status',
      arguments: { task_id: taskId }
    });
    const statusText = statusRes.result?.content?.[0]?.text || '{}';
    let status;
    try { status = JSON.parse(statusText); } catch { status = { raw: statusText }; }
    const newLogs = status.logs?.slice(lastLogCount) || [];
    lastLogCount = status.logs?.length || 0;
    // Print new logs
    for (const log of newLogs) {
      process.stdout.write(log);
    }
    // Only print status line every 6 polls (30s) or on terminal state
    if (i % 6 === 0 || status.status === 'completed' || status.status === 'failed') {
      console.log(`\n  [${i+1}] status=${status.status}, exitCode=${status.exit_code}, logs=${lastLogCount}`);
    }
    if (status.status === 'completed' || status.status === 'failed') {
      taskDone = true;
      if (status.status === 'completed') {
        console.log('  ✅ 编译成功');
      } else {
        console.log('  ❌ 编译失败');
        console.log('  最后日志:', status.logs?.slice(-10));
      }
    }
  }

  if (!taskDone) {
    console.log('  ⏱️ 编译超时');
    proc.kill();
    return;
  }

  console.log('\n=== 4. Upload ===');
  const uploadRes = await send('tools/call', {
    name: 'arduflux_upload',
    arguments: { sketch_path: './test/mus4/mus4.ino', port: 'COM24' }
  });
  console.log('Upload response:', JSON.stringify(uploadRes, null, 2));
  
  if (uploadRes.error) {
    console.log('❌ Upload failed (SDK error):', uploadRes.error);
    proc.kill();
    return;
  }
  
  const uploadText = uploadRes.result?.content?.[0]?.text || '{}';
  let uploadResult;
  try { uploadResult = JSON.parse(uploadText); } catch { uploadResult = { raw: uploadText }; }
  console.log('Parsed upload result:', JSON.stringify(uploadResult, null, 2));
  
  if (uploadResult.error) {
    console.log('❌ Upload failed:', uploadResult.error);
    proc.kill();
    return;
  }

  // Poll task status (5s interval, up to 60 times = 5 min max)
  taskDone = false;
  lastLogCount = 0;
  for (let i = 0; i < 60 && !taskDone; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await send('tools/call', {
      name: 'arduflux_get_task_status',
      arguments: { task_id: uploadResult.task_id }
    });
    const statusText = statusRes.result?.content?.[0]?.text || '{}';
    let status;
    try { status = JSON.parse(statusText); } catch { status = { raw: statusText }; }
    const newLogs = status.logs?.slice(lastLogCount) || [];
    lastLogCount = status.logs?.length || 0;
    for (const log of newLogs) {
      process.stdout.write(log);
    }
    if (i % 6 === 0 || status.status === 'completed' || status.status === 'failed') {
      console.log(`\n  [${i+1}] status=${status.status}, exitCode=${status.exit_code}, logs=${lastLogCount}`);
    }
    if (status.status === 'completed' || status.status === 'failed') {
      taskDone = true;
      if (status.status === 'completed') {
        console.log('  ✅ 上传成功');
      } else {
        console.log('  ❌ 上传失败');
        console.log('  最后日志:', status.logs?.slice(-10));
      }
    }
  }

  if (!taskDone) {
    console.log('  ⏱️ 上传超时');
    proc.kill();
    return;
  }

  console.log('\n=== 5. Monitor ===');
  const monitorRes = await send('tools/call', {
    name: 'arduflux_monitor',
    arguments: { port: 'COM24' }
  });
  console.log('Monitor response:', JSON.stringify(monitorRes, null, 2));
  const monitorText = monitorRes.result?.content?.[0]?.text || '{}';
  let monitorResult;
  try { monitorResult = JSON.parse(monitorText); } catch { monitorResult = { raw: monitorText }; }
  console.log('Parsed monitor result:', JSON.stringify(monitorResult, null, 2));

  console.log('\n=== Done ===');
  proc.kill();
}

main().catch(e => {
  console.error(e);
  proc.kill();
});
