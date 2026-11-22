# 07: Prove joint exploration in the relocated offline app

**What to build:** A researcher can move the generated folder, open it directly from disk, and reproduce the same original-case result, Sensitivity Bars, and What-If Sandbox comparisons without a network, server, or agent host.

**Blocked by:** 04: Compare and reset an isolated What-If Sandbox; 06: Add authored numeric sweeps to the tornado chart

**Status:** ready-for-agent

- [ ] Exercise one routed synthetic fixture through the public build. Independently derive two distinct nonzero score spans and a multi-input variant result that matches neither isolated edit and is absent from both one-input sweeps for the baseline. Include a shared input and an unrelated same-label input.
- [ ] Confirm that variant edits and reset leave the original and chart unchanged. Editing the original refreshes the chart without overwriting an open draft. Confirm the sandbox remains usable from a missing, invalid, or unmet original and that decision switching drops the draft.
- [ ] Repeat exploration checks after moving the whole output folder. Open the printed entry point via `file://` in offline Playwright with service workers blocked; observe no network requests, sockets, or uncaught page errors. Check keyboard operation, readable chart details without hover, and clear original/variant labels.
- [ ] Document the v3 fixture invocation, inspect original XML and both reports, and complete the Phase 3 merge checklist including v1/v2 regressions. Record actual commands, results, and any manual accessibility checks in the implementation handoff.
