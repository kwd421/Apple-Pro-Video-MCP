---
name: fcpxml-roundtrip
description: Verify generated or modified FCPXML against a real Final Cut Pro import/export round trip. Use before claiming Final Cut compatibility or after changing FCPXML generation semantics.
---

# FCPXML round-trip verification

## When to use

Use this procedure after any change that affects generated FCPXML structure, timing, resource references, effects, titles, roles, captions, or timeline layout, and before promoting an app-compatibility claim to `confirmed`.

## Procedure

1. Run the repository checks first:

   ```bash
   npm install
   npm run check
   ```

2. Run `system_capabilities` and record the Final Cut Pro installation path and Node version.
3. Use `fcpxml_create_project` to generate a new uniquely named fixture from two small local clips. Never overwrite an existing user project or fixture.
4. Run `fcpxml_validate` and `fcpxml_inspect` on the generated file. Save the JSON outputs with the fixture notes.
5. Open the generated file with `finalcut_open_fcpxml`.
6. In Final Cut Pro, import into a disposable test library/event. Do not use a production library.
7. Inspect the timeline for:
   - clip order;
   - source in-points;
   - durations;
   - total project duration;
   - audio presence;
   - obvious relink/import warnings.
8. Export the imported project back to FCPXML from Final Cut Pro under a new filename.
9. Run `fcpxml_validate` and `fcpxml_inspect` on the exported file.
10. Compare the generated and exported documents semantically. Attribute ordering, resource IDs, and harmless normalization may differ; focus on timeline meaning.
11. Save both FCPXML files and a short result note under `test/fixtures/roundtrip/<date>-<case>/`.
12. Only after the app test succeeds may the tested behavior be labeled `observed`. Promote to `confirmed` only when the behavior is also supported by current primary Apple documentation or repeated across the supported app versions you intend to claim.

## Traps

- Final Cut may normalize resource IDs or structure on export; byte equality is not the goal.
- A structurally valid FCPXML file can still be rejected by Final Cut.
- Importing into a production library creates unnecessary risk; use a disposable library/event.
- Never silently replace an existing fixture. Keep each round trip append-only by date/case.

## Verified

Not yet verified on a real Final Cut Pro installation.

## Evidence

Repository XML and MCP tests exist, but no retained real-app round-trip fixture is present yet. Therefore Final Cut application compatibility remains `unknown`/`unverified` until this procedure passes.
