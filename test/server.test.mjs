import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

function waitForResponse(responses, id, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (responses.has(id)) return resolve(responses.get(id));
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for JSON-RPC response ${id}.`));
      setTimeout(poll, 10);
    };
    poll();
  });
}

test('stdio server initializes and exposes seven tools', async (context) => {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('..', import.meta.url),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  context.after(() => {
    if (!child.killed) child.kill('SIGTERM');
  });

  const responses = new Map();
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    while (true) {
      const newline = stdout.indexOf('\n');
      if (newline === -1) break;
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) responses.set(message.id, message);
    }
  });

  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'apple-pro-video-test', version: '1.0.0' }
    }
  })}\n`);
  const initialized = await waitForResponse(responses, 1);
  assert.equal(initialized.result.serverInfo.name, 'apple-pro-video-mcp');

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
  const listed = await waitForResponse(responses, 2);
  assert.equal(listed.result.tools.length, 7, stderr);
  assert.ok(listed.result.tools.some((tool) => tool.name === 'fcpxml_create_project'));

  child.stdin.end();
});
