# Changelog

## 2026-11-22

- Built and verified an offline app for the six-week follow-up decision. The generated app opens directly from disk and shows the guidance, source citation, and Do-Not-Consider Score when the source condition is met.
- Explained which source condition is unmet when the follow-up guidance does not apply, and prompted for the missing Case Input when its value is unknown.
- Added pre-build validation for Decide XML, including schema version, references, probabilities, and duplicate Case Input display labels. Corrected handling of the UTF-8 byte-order mark.
- Moved model validation and inference checks to Vitest and retained Playwright for offline browser checks. Added coverage for byte-for-byte preservation of the source XML, bundled local assets, and preservation of the existing app when a rebuild is rejected.
- Added the Apache 2.0 license.
- Moved the user specification into `dev-docs/`, updated its cross-links, and recorded the offline milestone plan, requirements, and verification results. Added local issue notes and IDE ignore rules.

## 2026-11-21

- Added the initial Decide user specification, glossary, and README.
- Specified decision transparency requirements for source conditions, one-input-at-a-time sensitivity charts, and an interactive what-if sandbox.
- Added HeroUI dependencies and documented the project mission, roadmap, and technology stack.
- Added project agent skills and their lockfile.
