#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer, serverMetadata } from './server.js';

const handle = serveStdio(createServer, {
  onerror: (error) => console.error(`[${serverMetadata.name}] ${error.stack ?? error.message}`)
});

console.error(`[${serverMetadata.name}] ${serverMetadata.version} listening on stdio`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void handle.close().finally(() => {
      process.exitCode = 0;
    });
  });
}
