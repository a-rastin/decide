# 05: Relocated offline verification and Phase 2 documentation

**What to build:** A researcher can relocate a published mixed-fixture build to another folder and run all offline `file://` checks with networking disabled and no server or agent host, and a build author has clear documentation of the build commands, report meanings, rerun behavior, and verification results.

**Blocked by:** 04: Safe non-overwriting publication and explicit replacement

**Status:** ready-for-agent

- [ ] Automate offline `file://` Playwright checks on the published mixed-fixture build and again after relocating the output folder to a different path, confirming zero network requests and styled, operable HeroUI controls in both locations.
- [ ] Verify all offline browser criteria on the relocated build: research-only and partial-build notices, routing before case questions, exclusion of unverified decisions, relevant-only inputs with shared-reference reuse and non-reuse across same-labeled inputs, categorical applicable/negative/unknown transitions, and numeric unit display, boundary evaluation, blank-as-missing, and invalid-input handling.
- [ ] Document the mixed-fixture build commands, coverage and test report meanings, rerun and replacement behavior, and verification results.
- [ ] Run the full merge-readiness verification (`npm run typecheck`, `npm test`, and the documented mixed-fixture build with report inspection) and confirm all checks pass.
