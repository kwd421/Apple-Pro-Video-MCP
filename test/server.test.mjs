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

test('stdio server initializes, lists eleven tools, and calls old and new tools', async (context) => {
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
  assert.equal(initialized.result.serverInfo.version, '0.2.0');

  server.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listed = await server.waitFor(2);
  assert.equal(listed.result.tools.length, 11);
  for (const name of ['highlight_rank', 'edit_plan_build', 'subtitle_segment', 'subtitle_write_srt', 'fcpxml_create_project']) {
    assert.ok(listed.result.tools.some((tool) => tool.name === name), `missing ${name}`);
  }

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
  const validated = await server.waitFor(3);
  assert.equal(validated.result.isError, undefined);
  assert.equal(validated.result.structuredContent.valid, true);

  server.send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'highlight_rank',
      arguments: {
        profile: 'interview_short',
        targetDurationSeconds: 30,
        candidates: [{
          id: 'answer',
          sourceId: 'interview',
          startSeconds: 4,
          endSeconds: 12,
          text: 'A concise answer',
          metrics: { hook: 80, payoff: 90, clarity: 90, emotion: 60, novelty: 70, editability: 90, visual: 50 }
        }]
      }
    }
  });
  const ranked = await server.waitFor(4);
  assert.equal(ranked.result.isError, undefined);
  assert.equal(ranked.result.structuredContent.ranked[0].id, 'answer');

  server.send({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'subtitle_segment',
      arguments: {
        words: [
          { text: 'hello', startSeconds: 0, endSeconds: 0.4 },
          { text: 'world', startSeconds: 0.41, endSeconds: 0.9 }
        ]
      }
    }
  });
  const subtitled = await server.waitFor(5);
  assert.equal(subtitled.result.isError, undefined);
  assert.equal(subtitled.result.structuredContent.cueCount, 1);
  assert.match(subtitled.result.structuredContent.srt, /hello world/);

  server.child.stdin.end();
});
