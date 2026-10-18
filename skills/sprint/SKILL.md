---
name: sprint
description: Manage and enforce the mandatory 8-phase Agile Sprint Ceremonies protocol (validation, grooming, planning, working, demo, uat, release, retro). Use when running sprints or starting tasks.
---

# Agile Sprint Ceremonies Governance

When the user requests to plan, execute, or complete work, you MUST follow the mandatory 8-phase sprint ceremony protocol.

## Strict Ceremonies Sequence

1. **Phase 1: `validation` (PO & Dev Story Validation)**
   - Location: Meeting Room 2
   - Attendees: `product-manager`, `system-architect`, `coder`
   - Command: Call `office_sprint_ceremony({ phase: "validation" })` or run `agent-team validate`
   - Goal: PO brings the story card to Dev and Architect to validate technical feasibility and refine Acceptance Criteria (AC).

2. **Phase 2: `grooming` (Backlog Grooming & Point Estimation)**
   - Location: Meeting Room 1
   - Attendees: `product-manager`, `coder`, `qa-tester`, `code-reviewer`, `system-architect`
   - Command: Call `office_sprint_ceremony({ phase: "grooming", points: N })` or run `agent-team groom [pts]`
   - Goal: Team analyzes edge cases, test vectors, and estimates Fibonacci story points.

3. **Phase 3: `planning` (Sprint Planning in Boardroom)**
   - Location: Meeting Room 5 (Main Boardroom)
   - Attendees: All 8 Leads & Specialists
   - Command: Call `office_sprint_ceremony({ phase: "planning" })` or run `agent-team plan`
   - Goal: Decompose task DAG waves, assign subtasks to agents, and commit to sprint scope.

4. **Phase 4: `working` (Active Sprint Execution)**
   - Location: Open-Space Workbenches
   - Attendees: All 10 agents at their desks
   - Command: Call `office_sprint_ceremony({ phase: "working" })`
   - Goal: Agents actively implement features and write tests. Update progress via `office_update_progress`.

5. **Phase 5: `demo` (Sprint Feature Demo)**
   - Location: Meeting Room 3
   - Attendees: `coder`, `ui-ux-designer`, `qa-tester`, `product-manager`
   - Command: Call `office_sprint_ceremony({ phase: "demo" })` or run `agent-team demo`
   - Goal: Dev team demonstrates implemented functionality to the PO and stakeholders.

6. **Phase 6: `uat` (Formal UAT Verification & Sign-Off)**
   - Location: Meeting Room 2
   - Attendees: `product-manager`, `qa-tester`, `coder`, `system-architect`
   - Command: Call `office_sprint_ceremony({ phase: "uat" })` or run `agent-team uat`
   - Goal: **MANDATORY**: PO and QA verify acceptance criteria. Formal sign-off is required before any production release.

7. **Phase 7: `release` (Production Release & Canary Rollout)**
   - Location: Meeting Room 4
   - Attendees: `devops-release`, `runtime-sre`, `coder`, `system-architect`
   - Command: Call `office_sprint_ceremony({ phase: "release" })` or run `agent-team release`
   - Goal: Deploy release artifact to production with canary verification.

8. **Phase 8: `retro` (Sprint Retrospective)**
   - Location: Meeting Room 5 (Main Boardroom)
   - Attendees: All 8 Leads & Specialists
   - Command: Call `office_sprint_ceremony({ phase: "retro" })` or run `agent-team retro`
   - Goal: Analyze sprint retrospective, extract lessons learned, and formulate action items.

## Closing & Advancing Sprints

- After Phase 8 (`retro`), call `office_sprint_complete({ summary: "..." })` (or `agent-team sprint complete`) to archive the sprint. This marks the associated Taskwarrior/Jira card as `done`.
- Call `office_sprint_start` to kick off the next sprint milestone.
