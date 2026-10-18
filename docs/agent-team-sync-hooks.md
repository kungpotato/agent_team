# Claude Code sync hooks for agent-team

The office dashboard (`http://localhost:3333`) only reflects reality when something calls
`office_set_work` / `office_desk_visit` / etc. Relying on Claude to remember to call these after
every real subagent dispatch does not hold up over a long session — install these two hooks in
the **host project** (not in this repo) so the sync is structural, not a memory aid.

First implemented and verified working in T-CAMPFolio's `.claude/hooks/` during a multi-wave
US-04 epic (dozens of real coder/code-reviewer subagent dispatches across several hours).

## 1. `.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/sync-agent-team.js"],
            "timeout": 5
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/subagent-stop-sync.js"],
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## 2. `.claude/hooks/sync-agent-team.js` (fires on every real `Agent` tool dispatch)

```js
#!/usr/bin/env node
const SUBAGENT_TO_OFFICE_NAME = {
  coder: 'coder1',
  'code-reviewer': 'reviewer1',
  'project-planner': 'project-planner1',
  'system-architect': 'system-architect1',
  'product-manager': 'product-manager1',
  'ui-ux-designer': 'ui-ux-designer1',
  'design-to-code': 'design-to-code1',
  'qa-tester': 'qa-tester1',
  'runtime-sre': 'runtime-sre1',
  'devops-release': 'devops-release1',
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

async function main() {
  const raw = await readStdin();
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  if (payload.tool_name !== 'Agent') process.exit(0);

  const input = payload.tool_input || {};
  const subagentType = input.subagent_type || 'claude';
  const officeName = SUBAGENT_TO_OFFICE_NAME[subagentType] || `${subagentType}1`;
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
    // agent-team server not running/unreachable — never block the real tool call for this.
  }
  process.exit(0);
}

main();
```

## 3. `.claude/hooks/subagent-stop-sync.js` (fires when that subagent actually finishes)

```js
#!/usr/bin/env node
const SUBAGENT_TO_OFFICE_NAME = {
  coder: 'coder1',
  'code-reviewer': 'reviewer1',
  'project-planner': 'project-planner1',
  'system-architect': 'system-architect1',
  'product-manager': 'product-manager1',
  'ui-ux-designer': 'ui-ux-designer1',
  'design-to-code': 'design-to-code1',
  'qa-tester': 'qa-tester1',
  'runtime-sre': 'runtime-sre1',
  'devops-release': 'devops-release1',
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

async function main() {
  const raw = await readStdin();
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const agentType = payload.agent_type || 'claude';
  const officeName = SUBAGENT_TO_OFFICE_NAME[agentType] || `${agentType}1`;
  const lastMessage = String(payload.last_assistant_message || '').trim();
  const snippet = lastMessage.slice(0, 140) || 'done';
  const task = `✅ done: ${snippet}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch('http://localhost:3333/api/agents/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: officeName, task, progress: 100 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // agent-team server not running/unreachable — never block the real session for this.
  }
  process.exit(0);
}

main();
```

Make both executable: `chmod +x .claude/hooks/*.js`.

## Optional 3rd hook: `Stop` — structurally prevent stopping mid-story

The two hooks above keep the dashboard honest, but they don't stop Claude from pausing
mid-story to ask "should I continue to the next wave?" when nothing new actually needs deciding
— that's a separate, worse failure mode (confirmed in practice: a long epic repeatedly stalled
with "wave N done, continue to wave N+1?" even though CLAUDE.md already said not to ask).

A `Stop` hook can fix this structurally: Claude Code's `Stop` event fires right before a turn
ends, and a command hook that exits with code `2` **blocks the turn from ending at all** — the
model is handed the hook's stderr and must act on it. Unlike a note in CLAUDE.md, this doesn't
depend on the model remembering anything.

`.claude/hooks/story-continue-guard.cjs` (must be `.cjs` if the host repo's `package.json` has
`"type": "module"`, or plain `.js` otherwise):

```js
#!/usr/bin/env node
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
  try { return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')); } catch { return {}; }
}
function writeCounters(c) {
  try { fs.writeFileSync(COUNTER_FILE, JSON.stringify(c)); } catch { /* best-effort */ }
}

async function main() {
  const raw = await readStdin();
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const lastMessage = String(payload.last_assistant_message || '');
  if (BLOCK_MARKER.test(lastMessage)) process.exit(0); // explicit human-blocked escape hatch

  const cwd = payload.cwd || process.cwd();
  const twBin = path.join(cwd, 'bin', 'tw'); // adapt to this project's own task-board CLI
  if (!fs.existsSync(twBin)) process.exit(0); // not a kanban-enabled project, fail open

  let doingCards;
  try {
    const out = execFileSync(twBin, ['status:pending', 'stage:doing', 'export'], { cwd, encoding: 'utf8', timeout: 5000 });
    doingCards = JSON.parse(out || '[]');
  } catch { process.exit(0); } // tooling failure — fail open, never block on that

  if (!Array.isArray(doingCards) || doingCards.length === 0) process.exit(0);

  const storyIds = doingCards.map((c) => c.storyid).filter(Boolean).sort();
  const counterKey = `${payload.session_id || 'unknown'}::${storyIds.join(',')}`;
  const counters = readCounters();
  const count = (counters[counterKey] || 0) + 1;
  counters[counterKey] = count;
  writeCounters(counters);

  if (count > MAX_FORCES) process.exit(0); // safety valve tripped — give up forcing

  process.stderr.write(
    `Story card(s) still in stage:doing: ${storyIds.join(', ')}. Continue the pipeline instead ` +
    `of stopping. If genuinely blocked on a human-only step, say so with the literal text ` +
    `"STORY-BLOCKED: <reason>" so this check lets you stop. (force ${count}/${MAX_FORCES})\n`
  );
  process.exit(2);
}

main();
```

Register it in `.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/story-continue-guard.cjs"], "timeout": 10 }]
      }
    ]
  }
}
```

**Loop-safety guarantees (verified by direct testing, not just reasoning about the code):**
- Escape hatch: a reply containing the literal text `STORY-BLOCKED:` always allows the stop,
  immediately, no matter the counter state.
- Hard cap: `MAX_FORCES` (5) forced continuations per unique (session, stuck-story-set) — once
  exceeded, the hook always allows the stop, even if its own detection logic is wrong about
  something. The counter resets implicitly once the stuck story set changes (i.e. real progress
  was made), since the counter key includes the sorted story-id list.
- Fail-open everywhere else: missing `tw` binary, a `tw` process error, bad JSON, wrong
  directory — all of these `exit(0)` rather than risk blocking a session that genuinely has
  nothing in `stage:doing` or where this hook's own assumptions don't hold.

**Known restriction, confirmed in practice:** Claude Code's own permission system treats editing
`.claude/settings.json` to add a `Stop` (or any hook that governs the session's own control
flow) as "Self-Modification" and can refuse Claude's own `Edit`/`Write` tool calls for it,
independent of whatever the host project's permission mode otherwise allows — the classifier may
still approve it on a retry depending on context, but Claude should not try to work around a
denial here (e.g. via `sed`/sudo-style tricks through Bash) if it recurs; surface it to the human
and let them add the 6-line settings.json entry themselves instead. This is specific to the
`Stop`-hook step — the `PostToolUse`/`SubagentStop` hooks above have not hit this restriction.

## 4th hook: `ceremony-cleanup.js` — the real fix for "dashboard full of agents that aren't real"

**Root cause, found and fixed in T-CAMPFolio after it recurred many times across a long
session:** `office_sprint_ceremony` (and `office_sprint_start`/`office_sprint_next`/
`office_sprint_complete`) seat "attendee" desks for a ceremony room (e.g. the `planning` phase
seats `product-manager1`, `coder1`, `qa-tester1`, ... in the boardroom) — but nothing ever
cleared those desks once the ceremony call returned. In this project's actual workflow,
ceremonies are instant structured tool calls, not real multi-minute meetings, so those desks
just sat there as "working" indefinitely (or until `office-stale-cleanup.js`'s 10-minute TTL
caught them), making the dashboard look like a room full of busy agents between real dispatches
— the exact complaint that kept recurring.

The fix has two parts:

1. **`real-desks-state.js`** — a tiny shared on-disk set (`.claude/hooks/.real-desks.json`,
   gitignore it) of desk names that correspond to a REAL, currently in-flight `Agent` tool
   dispatch. `sync-agent-team.js` adds to it on dispatch; `subagent-stop-sync.js` removes from
   it on completion.
2. **`ceremony-cleanup.js`** (PostToolUse, matcher covers all 4 ceremony/sprint-lifecycle
   tools) — right after every such call, diff the live "working" roster against that real-desk
   set and remove everything that isn't a real dispatch. No 10-minute wait, no manual
   `office_dismiss` call — the dashboard is correct again before the next tool result even
   renders.

This keeps the intended signal honest in both directions: **a ceremony call shows its
attendees seated while it's happening** (that part was already accurate — the office system's
own ceremony logic does that correctly), **and clears them the instant the "meeting" is over**,
while a **real dispatch's desk is never touched** by this sweep because it's tracked
separately and protected.

Add `real-desks-state.js` and `ceremony-cleanup.js` to the files copied into
`.claude/hooks/`, and register the extra `PostToolUse` matcher:

```json
{
  "matcher": "mcp__agent-team__office_sprint_ceremony|mcp__agent-team__office_sprint_start|mcp__agent-team__office_sprint_next|mcp__agent-team__office_sprint_complete",
  "hooks": [
    { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/ceremony-cleanup.js"], "timeout": 5 }
  ]
}
```

(`agent-team install-hooks` already does all of this automatically as of this fix — re-run it
on an existing host project to pick up the new hook pair.)

## Known limitations

- A *resumed* agent (via `SendMessage`, e.g. to fix a stale-worktree issue mid-task) does not
  re-fire `PostToolUse` on `Agent` — a manual `office_set_work`/`office_desk_visit` call is still
  the only way to reflect that specific handoff.
- Each `subagent_type` maps to exactly one office desk (e.g. all `coder` dispatches share
  `coder1`), so running many `coder` subagents in parallel will show only the most recently
  dispatched one's task text — the dashboard is a best-effort mirror, not a precise 1:1 map when
  parallelism is high.
- `office_set_work`'s auto-spawn-if-absent behavior means a typo'd or novel `subagent_type` still
  shows up as a new desk (`<type>1`) rather than failing silently — this is usually fine, just be
  aware the roster can grow if many distinct subagent types are used across a session.
