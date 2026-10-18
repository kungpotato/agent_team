---
name: office
description: Simulate 8-bit virtual office activities including walking desk visits (ask/consult), meeting rooms 1-5 with waiting queue, agent status, and shift clock-out.
---

# 8-Bit Virtual Office Simulation

Control agent behaviors and interactions within the 8-bit tech startup office.

## Available Actions

### 1. Desk Visit (Ask / Consult)
Send an agent walking across hallways to another desk to ask a question:
- MCP: Call `office_desk_visit({ from_agent: "pm1", to_agent: "coder1", question: "Can we support OAuth2 PKCE?" })`
- CLI: `agent-team ask pm1 coder1 "Can we support OAuth2 PKCE?"`
- Return to desk: `office_return_to_desk({ agent_name: "pm1" })` or `agent-team return pm1`

### 2. Meeting Rooms (Rooms 1-5, Capacity 8)
- Reserve a meeting room: `office_start_meeting({ agents: ["coder1", "reviewer1"], room: 1, topic: "Code Review" })`
- If room is full (8/8), requests are automatically placed in the waiting queue.
- Free a meeting room: `office_end_meeting({ room: 1 })`. Automatically admits the next queued meeting!

### 3. Shift Clock-Out (End of Day)
- Reset and dismiss all agents from desks and meeting rooms:
- MCP: `office_reset`
- CLI: `agent-team clock-out`
