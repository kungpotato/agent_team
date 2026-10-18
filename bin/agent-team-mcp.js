#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distMcpPath = path.resolve(__dirname, '../dist/mcp/index.js');
const srcMcpPath = path.resolve(__dirname, '../src/mcp/index.ts');
const tsxBin = path.resolve(__dirname, '../node_modules/.bin/tsx');

let child;
if (fs.existsSync(distMcpPath)) {
  child = spawn(process.execPath, [distMcpPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env
  });
} else {
  child = spawn(process.execPath, [tsxBin, srcMcpPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env
  });
}

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
