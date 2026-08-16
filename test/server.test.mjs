import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

function startServer() {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stdoutBuffer = '';
  let stderr = '';
  const responses = new Map();
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    while (true) {
      const newline = stdoutBuffer.indexOf('\n');
      if (newline === -1) break;
      const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '');
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) responses.set(message.id, message);
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const waitFor = async (id, timeoutMs = 6000) => {
    const deadline = Date.now() + timeoutMs;
    while (!responses.has(id) && Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`MCP server exited with ${child.exitCode}. stderr: ${stderr}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!responses.has(id)) throw new Error(`Timed out waiting for response ${id}. stderr: ${stderr}`);
    return responses.get(id);
  };

  return { child, send, waitFor, stderr: () => stderr };
}

test('stdio server initializes, lists seven tools, and calls a tool', async (context) => {
  const server = startServer();
  context.after(() => server.child.kill('SIGTERM'));

  server.send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'apple-pro-video-test', version: '1.0.0' }
    }
  });
  const initialized = await server.waitFor(1);
  assert.equal(initialized.result.serverInfo.name, 'apple-pro-video-mcp');

  server.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listed = await server.waitFor(2);
  assert.equal(listed.result.tools.length, 7);
  assert.ok(listed.result.tools.some((tool) => tool.name === 'fcpxml_create_project'));

  server.send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'fcpxml_validate',
      arguments: {
        xml: '<!DOCTYPE fcpxml><fcpxml version="1.11"><resources/><library><event><project><sequence duration="1s"><spine/></sequence></project></event></library></fcpxml>'
      }
    }
  });
  const called = await server.waitFor(3);
  assert.equal(called.result.isError, undefined);
  assert.equal(called.result.structuredContent.valid, true);

  server.child.stdin.end();
});
