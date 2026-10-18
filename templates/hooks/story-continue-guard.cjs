#!/usr/bin/env node
/**
 * Stop hook: structurally blocks the session from ending while a Taskwarrior story card is
 * still in `stage:doing` and nothing explicitly says work is blocked on a human.
 *
 * This exists because relying on CLAUDE.md/memory text ("don't stop mid-story") only works if
 * Claude reads and remembers it every turn — this hook makes it a hard, programmatic gate
 * instead: exit code 2 on a Stop hook blocks the turn from ending at all.
 *
 * Escape hatches (so this can never spin forever):
 *   1. If the final assistant message contains the literal marker `STORY-BLOCKED:` (case
 *      insensitive), the session is allowed to stop — this is how a genuinely human-only step
 *      (e.g. "waiting for you to create a secret in the Firebase console") is signalled.
 *   2. A per-(session, stuck-story-set) counter caps forced continuations at MAX_FORCES. Once
 *      exceeded, the hook gives up and allows the stop, rather than looping forever on a bug in
 *      this script's own logic or a story that's stuck for a reason it can't detect.
 *   3. Any error (tw not found, bad JSON, wrong directory) fails open — exit 0, never block.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_FORCES = 5;
const COUNTER_FILE = '/tmp/claude-story-continue-guard.json';
const BLOCK_MARKER = /story-blocked:/i;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    setTimeout(() => resolve(data), 1000);
  });
}

function readCounters() {
  try {
    return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeCounters(counters) {
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(counters));
  } catch {
    // best-effort only — never let a disk error block or crash the hook
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

  const lastMessage = String(payload.last_assistant_message || '');
  if (BLOCK_MARKER.test(lastMessage)) {
    process.exit(0); // explicit human-blocked escape hatch
  }

  const cwd = payload.cwd || process.cwd();
  const kanbanBin = path.join(cwd, 'bin', 'tw');
  if (!fs.existsSync(kanbanBin)) process.exit(0); // not a kanban-enabled project, fail open

  let doingCards;
  try {
    const out = execFileSync(kanbanBin, ['status:pending', 'stage:doing', 'export'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    });
    doingCards = JSON.parse(out || '[]');
  } catch {
    process.exit(0); // tw unavailable/erroring — fail open, never block on a tooling failure
  }

  if (!Array.isArray(doingCards) || doingCards.length === 0) {
    process.exit(0); // nothing in progress — fine to stop
  }

  const storyIds = doingCards.map((c) => c.storyid).filter(Boolean).sort();
  const sessionId = payload.session_id || 'unknown-session';
  const counterKey = `${sessionId}::${storyIds.join(',')}`;

  const counters = readCounters();
  const count = (counters[counterKey] || 0) + 1;
  counters[counterKey] = count;
  writeCounters(counters);

  if (count > MAX_FORCES) {
    process.exit(0); // safety valve tripped — give up forcing, allow the stop
  }

  process.stderr.write(
    `Story card(s) still in stage:doing: ${storyIds.join(', ')}. Continue the pipeline ` +
    `(next wave, pending review, merge, or kanban sync) instead of stopping. If genuinely ` +
    `blocked on a human-only step, say so explicitly with the literal text "STORY-BLOCKED: <reason>" ` +
    `in your reply so this check lets you stop. (force ${count}/${MAX_FORCES})\n`
  );
  process.exit(2);
}

main();
