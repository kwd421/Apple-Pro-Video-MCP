---
name: motion-template-inspection
description: Inspect real Apple Motion template files safely and promote observed schema details into reusable knowledge without guessing mutation semantics.
---

# Motion template inspection

## When to use

Use when adding support for `.moti`, `.motr`, `.moef`, or `.motn`, investigating published parameters, or deciding whether a Motion project field is safe to mutate.

## Procedure

1. Copy a representative user template to a disposable fixture location. Do not experiment on the installed original.
2. Record the Motion version and template kind.
3. Run `motion_inspect_template` on the copy and save the result.
4. Identify candidate elements/attributes for the behavior under investigation.
5. Label each finding:
   - `observed` for literal XML structure seen in the file;
   - `assumed` for inferred semantics;
   - `unknown` when meaning cannot be established.
6. If mutation is being considered, duplicate the fixture again and change **one field only**.
7. Open the modified copy in Motion. Check whether it loads, preserves the intended object, and exposes the intended published parameter.
8. If relevant, save/install the test template in a disposable category and verify that Final Cut Pro discovers it and that the parameter behaves as expected.
9. Export/save again from Motion and diff the resulting XML against the input to see what Motion normalized.
10. Record the successful procedure and exact field interpretation in `memory/knowledge/motion.md` with the app versions and date.
11. Add a regression fixture/test before wiring generic mutation into the MCP.

## Traps

- Similar-looking XML fields can have different semantics between template kinds.
- Motion may rewrite IDs and metadata during save; do not infer meaning from identifier stability alone.
- A template loading successfully in Motion does not prove Final Cut sees or controls the same published parameters.
- Installed templates are user assets; never mutate them in place during research.

## Verified

Generic XML inspection is covered by repository tests. Real Motion schema semantics and mutation behavior have not yet been verified against a retained real-app fixture.

## Evidence

`motion_inspect_template` can parse and summarize template XML, but mutation remains intentionally gated until a real template round trip is captured.
