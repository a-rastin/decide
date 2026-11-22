# Phase 1 validation and merge criteria

This checklist gates the Phase 1 implementation, not the first release. For context, see [requirements.md](requirements.md) and the [roadmap exit check](../roadmap.md).

## Build checks

- [x] From a clean checkout with documented prerequisites, install locked dependencies and run the documented public build command with the six-week fixture. Confirm success and a portable output folder with `index.html`, the authoritative XML, and the required local assets.
- [ ] Run the same build with malformed or structurally invalid XML, with an unsupported schema version, and with structurally valid XML containing an invalid probability distribution. Each run fails with a useful error and does not generate a new app from the rejected model.
- [x] Build a temporary valid variant that changes the complementary action probabilities (for example, from 99/1 to 95/5). The applicable case shows a 5% Do-Not-Consider Score without changes to the UI code. The acceptance fixture remains 99/1.

## Offline browser checks

Open the generated `index.html` via `file://` in a browser with networking disabled and no server or agent host running. Use the same artifact for all three synthetic cases.

| Case | Expected result |
| --- | --- |
| Applies | Shows the six-week next step, why it applies, and a matching short citation. Displays a **1% Do-Not-Consider Score** for rechecking, labels the Research Modeling Convention, and does not present the score as a clinical probability. |
| Does not apply | Names the unmet source condition. Does not present the six-week action as applicable or display a score. |
| Unknown | Names the missing Case Input or prompts for it. Does not treat unknown as no, present the six-week action as applicable, or display a score. |

- [ ] Automate the case assertions through the visible UI. Switch from the applicable case to each unscored state and confirm that the previous score clears.
- [x] Confirm the HeroUI control is visibly styled and can change Case Inputs. Confirm the research-only, not-for-clinical-use notice is visible.
- [x] Confirm the app makes no network requests, and repeat the open-and-interact check from a relocated output folder.

## Ready to merge when

The build and offline browser checks pass, reviewers can reproduce them from the documented commands, and the implementation review includes the outcomes and identifies any manual checks. No failures affecting this phase’s exit check are deferred. No agent-host smoke test or later-phase feature is required for this merge.

## Task 01 verification

Run from a clean checkout with Node.js 24 or later.

```sh
npm ci
npm run build
npx playwright install chromium
npm run typecheck
npm test
```

- A clean checkout of the implementation files passed these commands with Node.js 24.22.0, npm 12.2.1, and Playwright Chromium 153.0.8010.12. The default build produced `dist/index.html`, `model.xml`, `app.js`, and `app.css`. npm warned that the esbuild postinstall script was blocked. The locked platform binary was available and the build succeeded.
- Both browser tests passed. Chromium opened the public build output through `file://` with networking disabled and observed zero network requests. Selecting **Yes** showed the six-week guidance, source condition, citation, convention, and **1%** score before and after moving the entire output folder.
- The second test built a temporary 95/5 XML model with the same app code. The resulting app displayed **5%** for the same case. The checked-in fixture retains 99/1.
- The initial browser test failed before the build entry point existed and passed after the implementation. A manual review of a screenshot from the offline Playwright run confirmed that the research-only notice and the styled, selected HeroUI radio option were visible.
- On the integration branch, `npm ci --offline --no-audit --no-fund` installed the locked dependencies from cache in a fresh source archive. The public build, type check, and both browser tests passed after review. Chromium required execution outside the command sandbox. The application browser contexts ran offline.
