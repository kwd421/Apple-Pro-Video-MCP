# Agent instructions

This repository uses a lightweight Ballast-inspired workflow. The Ballast runtime is not a product dependency; these files are development conventions for any capable coding agent.

## Before work

1. Read `memory/CHECKPOINT.md`.
2. Read `memory/DECISIONS.md`.
3. Read matching files under `memory/knowledge/`.
4. Read `.claude/ballast.rules.json` and follow every matching rule.
5. If the task matches a procedure under `.claude/skills/`, follow that procedure instead of rediscovering it.

## Evidence labels

Use these labels in research notes and status updates:

- `confirmed` — supported by primary documentation plus a passing repository/app check where relevant.
- `observed` — directly seen once in a tool run or app test.
- `assumed` — plausible inference that has not been verified.
- `hearsay` — reported by a secondary source but not independently verified.
- `unknown` — no adequate basis yet.

For Apple Pro Video behavior, automated XML/unit tests alone do not make an app-compatibility claim `confirmed`. Final Cut Pro or Motion behavior must be observed on an actual Mac before it is described as working in-app.

## Definition of done

Do not call a change done merely because code was written.

- code change: relevant tests pass;
- MCP change: stdio handshake/tool invocation passes;
- FCPXML behavior: structural tests pass, and app compatibility remains `unverified` until a Final Cut import/export round trip succeeds;
- Motion behavior: XML inspection tests pass, and mutation remains `unverified` until a real Motion/Final Cut round trip succeeds.

## Checkpoint

After a meaningful unit of work, update `memory/CHECKPOINT.md` with:

1. The story so far
2. Decided
3. Waiting on the user
4. Next first action
5. Tried

Keep `Next first action` executable without reading chat history.

## Reuse

If a multi-step procedure succeeds twice or is hard-won and likely to recur, capture it under `.claude/skills/<name>/SKILL.md` with:

- when to use;
- the exact successful procedure;
- traps encountered;
- verification date;
- evidence of success.
