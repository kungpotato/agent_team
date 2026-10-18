#!/usr/bin/env node
/**
 * PostToolUse hook (matcher: any mcp__agent-team__office_sprint_* tool): the root fix for the
 * project's long-standing "dashboard looks full of working agents that aren't real" problem.
 *
 * office_sprint_ceremony (and office_sprint_start/next/complete) populate "attendee" desks on
 * the 8-bit office dashboard as decoration for each ceremony room — e.g. calling the `planning`
 * phase seats product-manager1, coder1, qa-tester1, etc. in the boardroom. In this project's
 * actual workflow, ceremonies are instant structured calls, not real multi-minute meetings, so
 * those desks should never linger after the call returns — but nothing was clearing them, so
 * they sat there indefinitely (or until the next user prompt's 10-minute stale sweep), making
 * the dashboard look like a room full of busy agents between real dispatches.
 *
 * Fix: right after every ceremony/sprint-lifecycle tool call, diff the live "working" roster
 * against real-desks-state.js's set of genuinely in-flight `Agent` dispatches (maintained by
 * sync-agent-team.js / subagent-stop-sync.js) and remove everything that isn't a real dispatch.
 * No 10-minute wait, no manual `office_dismiss` call needed — the dashboard is correct again
 * before the next tool result is even rendered.
 *
 * Never blocks or fails the real tool call: all errors are swallowed and this always exits 0.
 */

import { readSet } from './real-desks-state.js';

const CEREMONY_TOOLS = new Set([
  'mcp__agent-team__office_sprint_ceremony',
  'mcp__agent-team__office_sprint_start',
  'mcp__agent-team__office_sprint_next',
  'mcp__agent-team__office_sprint_complete',
]);

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    setTimeout(() => resolve(data), 1000);
  });
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (!CEREMONY_TOOLS.has(payload.tool_name)) process.exit(0);

  const realDesks = readSet();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch('http://localhost:3333/api/agents', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) process.exit(0);
    const data = await res.json();
    const agents = Array.isArray(data.agents) ? data.agents : [];

    const ghosts = agents
      .filter((a) => !realDesks.has(a.name))
      .map((a) => a.name);

    if (ghosts.length > 0) {
      const removeController = new AbortController();
      const removeTimer = setTimeout(() => removeController.abort(), 1500);
      await fetch('http://localhost:3333/api/agents/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: ghosts }),
        signal: removeController.signal,
      });
      clearTimeout(removeTimer);
    }
  } catch {
    // agent-team server not running or unreachable — never block the real tool call for this.
  }

  process.exit(0);
}

main();
