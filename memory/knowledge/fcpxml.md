# FCPXML knowledge

This file stores reusable FCPXML findings with explicit evidence labels. Do not upgrade an app-compatibility claim merely because repository tests pass.

## confirmed

### MCP implementation uses frame-quantized rational FCP times

- Date: 2026-08-16
- Scope: repository implementation only
- Evidence: `src/fcpxml.js` converts supported frame rates to rational seconds and repository tests cover exact 29.97 fps conversion.
- Limit: this confirms what the generator writes, not that every generated document is accepted by Final Cut Pro.

### Existing output is preserved unless overwrite is explicit

- Date: 2026-08-16
- Scope: `fcpxml_create_project`
- Evidence: repository implementation uses exclusive destination creation for the non-overwrite path and has a regression test for existing-output protection.
- Limit: filesystem semantics can still fail due to permissions or unusual filesystems; the tool reports the error rather than replacing the target.

## observed

No retained real Final Cut Pro round-trip observations yet.

## assumed

### FCPXML 1.11 is an appropriate initial generation target

- Date: 2026-08-16
- Reason: the MVP generator currently writes `version="1.11"`.
- Status: assumed for target-app compatibility until a real Final Cut Pro import/export fixture is captured and primary documentation is checked for the target version.

## unknown

- Which Final Cut Pro versions should be declared supported.
- Which generated structures Final Cut normalizes on export for the target version.
- Whether future title, caption, role, transform, speed, and transition structures will round-trip without semantic loss.

## Next evidence needed

Follow `.claude/skills/fcpxml-roundtrip/SKILL.md` on the target Mac and retain the generated/exported files under `test/fixtures/roundtrip/`.
