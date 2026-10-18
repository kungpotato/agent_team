#!/usr/bin/env node
/**
 * Shared helper: a tiny on-disk set of office desk names that correspond to REAL, currently
 * in-flight `Agent` tool dispatches (not ceremony-meeting decoration). Written by
 * sync-agent-team.js on dispatch, cleared by subagent-stop-sync.js on completion, and read by
 * ceremony-cleanup.js to tell "a coder is actually working" apart from "office_sprint_ceremony
 * just populated an attendee desk for a meeting that already ended."
 *
 * Deliberately a flat JSON array on disk (not a DB) — this is single-session, best-effort state,
 * not a system of record. Corrupt/missing file always degrades to an empty set, never throws.
 *
 * ESM (not CommonJS): this repo's package.json sets "type": "module", so every hook script here
 * must use import/export, not require() — a bare `.js` file with require() throws at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '.real-desks.json');

export function readSet() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSet(set) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify([...set]), 'utf8');
  } catch {
    // best-effort only — never block the real hook/tool call over this.
  }
}

export function addRealDesk(name) {
  const set = readSet();
  set.add(name);
  writeSet(set);
}

export function removeRealDesk(name) {
  const set = readSet();
  set.delete(name);
  writeSet(set);
}
