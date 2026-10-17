#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliTsPath = path.resolve(__dirname, '../src/cli/index.ts');
const tsxBin = path.resolve(__dirname, '../node_modules/.bin/tsx');

const child = spawn(process.execPath, [tsxBin, cliTsPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
