#!/usr/bin/env node
/**
 * UserPromptSubmit hook: reconciles the agent-team office dashboard every time the user sends
 * a message, dismissing any desk whose status is still "working" but hasn't been updated in
 * STALE_MS — a safety net for cases where PostToolUse/SubagentStop's name mapping misses (e.g.
 * a completion event's agent_type doesn't match what the dispatch event assigned), which would
 * otherwise leave a desk stuck "busy" forever with no automatic way to clear it.
 *
 * This is a TTL-based cleanup, not a precise correlation fix — it can't tell a genuinely
 * long-running agent from a stuck one, so STALE_MS is generous (10 minutes). Never blocks the
 * real prompt: all errors are swallowed and this always exits 0.
 */

const STALE_MS = 10 * 60 * 1000;

async function main() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch('http://localhost:3333/api/agents', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) { process.exit(0); }
    const data = await res.json();
    const agents = Array.isArray(data.agents) ? data.agents : [];

    const now = Date.now();
    const staleNames = agents
      .filter((a) => a.status === 'working' && a.progress !== 100 && (now - (a.updatedAt || 0)) > STALE_MS)
      .map((a) => a.name);

    if (staleNames.length === 0) process.exit(0);

    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), 1500);
    await fetch('http://localhost:3333/api/agents/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: staleNames }),
      signal: controller2.signal,
    });
    clearTimeout(timer2);
  } catch {
    // agent-team server not running/unreachable — never block the real prompt for this.
  }
  process.exit(0);
}

main();
