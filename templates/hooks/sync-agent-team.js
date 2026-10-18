#!/usr/bin/env node
/**
 * PostToolUse hook (matcher "Agent"): mirrors every real `Agent` tool dispatch onto the
 * agent-team office dashboard (http://localhost:3333) automatically, so it never silently
 * drifts from what Claude Code is actually doing in this session.
 *
 * Every subagent_type gets a base desk name (coder -> "coder", code-reviewer -> "reviewer",
 * etc; an unrecognized type uses its own string as the base). On EVERY dispatch — even for a
 * type that already has a known base name — this queries the live office roster and assigns
 * the LOWEST free number for that base name (a desk not currently "working"), e.g. dispatching
 * two coders at once gives coder1 AND coder2, not two writes to the same coder1 slot. Once both
 * finish and their desks are marked done/dismissed, the next solo dispatch reuses coder1 again
 * — bounded growth, no persistent ever-incrementing counter needed.
 *
 * Never blocks or fails the real tool call: all errors are swallowed and this always exits 0.
 */

const BASE_NAME = {
  coder: 'coder',
  'code-reviewer': 'reviewer',
  'project-planner': 'project-planner',
  'system-architect': 'system-architect',
  'product-manager': 'product-manager',
  'ui-ux-designer': 'ui-ux-designer',
  'design-to-code': 'design-to-code',
  'qa-tester': 'qa-tester',
  'runtime-sre': 'runtime-sre',
  'devops-release': 'devops-release',
};

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    setTimeout(() => resolve(data), 1000);
  });
}

/** Lowest positive integer N such that `${baseName}${N}` is not a currently-busy desk. */
async function lowestFreeSlot(baseName) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch('http://localhost:3333/api/agents', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return 1;
    const data = await res.json();
    const agents = Array.isArray(data.agents) ? data.agents : [];
    const taken = new Set();
    const re = new RegExp(`^${baseName}(\\d+)$`);
    for (const a of agents) {
      const m = re.exec(a.name);
      if (m && a.status === 'working' && a.progress !== 100) {
        taken.add(Number(m[1]));
      }
    }
    let n = 1;
    while (taken.has(n)) n += 1;
    return n;
  } catch {
    return 1; // agent-team unreachable — degrade to the simple default, dispatch hook fails open anyway
  }
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (payload.tool_name !== 'Agent') process.exit(0);

  const input = payload.tool_input || {};
  const subagentType = input.subagent_type || 'claude';
  const baseName = BASE_NAME[subagentType] || subagentType;
  const slot = await lowestFreeSlot(baseName);
  const officeName = `${baseName}${slot}`;
  const task = String(input.description || input.prompt || 'working').slice(0, 160);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch('http://localhost:3333/api/agents/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: officeName, task, progress: 15 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // agent-team server not running or unreachable — never block the real tool call for this.
  }

  process.exit(0);
}

main();
