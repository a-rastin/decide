# Phase 2 validation and merge criteria

This checklist gates the [Phase 2 roadmap exit](../../roadmap.md), not the first release. Use the synthetic fixtures described in [requirements.md](requirements.md). Test through the public build command and generated app; use direct evaluator checks for focused threshold and case-state assertions.

## Build, reports, and reruns

- [ ] The documented public command builds the mixed fixture. The published folder contains `index.html`, the original validated XML byte for byte, local assets, and two separate, readable coverage and test reports.
- [ ] The coverage report reconciles the authored inventory: verified and delivered decisions, a modeled but excluded decision, and an Unresolved Decision with no model. Check that unreadable or unprocessed sections are identified separately, not counted as decisions. The build is labeled partial even if every modeled decision passes but an in-scope decision or section is missing. An all-passing and fully covered build is not labeled partial.
- [ ] The test report identifies the deliberately failing decision and synthetic case, expected and actual outcomes, and successful checks for other modeled decisions. It does not count unmodeled decisions as passing. Missing required verification cases do not silently pass.
- [ ] Invalid XML or model invariants fail with a useful error and no new app. A structurally valid build with no verified decisions also fails without publishing an app and names the affected decisions.
- [ ] Two successful invocations targeting the same destination generate distinct builds by default, report their actual entry points, and leave all contents of the first build unchanged. An explicit replacement succeeds only when requested. Failed reruns, including failed explicit replacement, preserve the previous artifact byte for byte and do not publish an incomplete app.
- [ ] The original six-week XML still works with the Phase 1 invocation and yields the same applicable, unmet, and missing outcomes. Its 99/1 convention produces a 1% Do-Not-Consider Score; the existing varied XML check still demonstrates that the score is derived from the model.

## Offline browser checks

Open the mixed build's `index.html` through `file://` with networking disabled and without a server or agent host. Repeat from a relocated output folder.

| Exercise | Expected result |
| --- | --- |
| Open the mixed app and select a route | Research-only and partial-build notices are visible. Topic or scenario selection precedes case questions. Only verified decisions offer usable guidance. |
| Switch between decisions | Only relevant Case Inputs appear. A shared reference retains its value; a different input with the same display label does not inherit it. |
| Enter a known categorical value that meets the source condition | Shows the expected next step, why it appeared, citation, and model-derived score labeled as distinct from clinical probability. |
| Switch from an applicable state to a known negative value, then to unknown | The negative value identifies the unmet source condition. Unknown identifies the relevant missing Case Input instead. Neither state shows stale applicable guidance or a score, and other verified decisions remain selectable. |
| Enter values below, exactly at, and above the numeric threshold | The input displays the model's units. Results follow the fixture's declared comparison operator exactly, including its boundary. |
| Clear the numeric input or enter an invalid value | Blank is missing, not zero or no. Invalid input is rejected or clearly flagged without silently rounding or coercing it; no stale score remains. |
| Inspect the relocated build | Routing and case outcomes still work with styled, operable HeroUI controls. No network requests are made from either location. |

## Ready to merge when

From a clean checkout with Node.js 24 or later, run:

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
```

`npm run test:validation` runs Vitest alone; `npm run test:offline` runs Playwright alone. Also run the documented mixed-fixture build command and inspect both generated reports. Record command results and any manual checks in the implementation review. All checklist items must pass; no Phase 3 feature or agent-host smoke test is required for this merge.
