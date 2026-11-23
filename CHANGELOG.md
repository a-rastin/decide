# Changelog

## 2026-11-23

- Added Decide XML v3 for offline case exploration: finite discrete Bayesian networks with root priors, complete conditional probability tables, multi-parent dependencies, latent nodes, and conditional action probabilities. For a v3 decision, the app derives the Do-Not-Consider Score from an exact posterior over the declared action node instead of a fixed value. Build-time checks reject malformed or unsupported networks, and v1 and v2 models, builds, reports, and fixtures keep working unchanged.
- Added numeric Case Inputs to v3 models with declared units, exact-decimal threshold partitions, and applicability thresholds compared exactly at equality. Missing, invalid, unmet, and indeterminate states stay distinct; inapplicable alternatives name the source condition and are not scored, and zero-likelihood evidence explains why no score exists.
- Added Sensitivity Bars to the generated app: one-input-at-a-time comparisons that hold the original case and model fixed, test every modeled category, and use authored numeric samples below, at, and above each threshold. Bars rank by comparable score span and list tested values, units, and reasons for unscored samples. When no input supports a comparison, the app explains why instead of drawing an empty chart, and keeps the sandbox available.
- Added a What-If Sandbox that edits several Case Inputs in an isolated variant, shows original and variant guidance, source reasons, citations, missing inputs, and scores side by side, and resets the variant without changing the original case, model, or chart. It remains available when the original cannot be scored.
- Added synthetic v3 fixtures and authored verification cases for [latent review](fixtures/latent-review/source.md), [numeric review](fixtures/numeric-review/source.md), [routed networks](fixtures/routed-network/source.md), and [joint exploration](fixtures/joint-exploration/source.md), with the [v3 XML and verification contract](dev-docs/specs/2026-11-22-add-offline-case-exploration/xml-v3.md) and worked scores.
- Extended Vitest and offline Playwright checks for exact inference, threshold boundaries, malformed-network rejection, verification failure isolation, non-destructive reruns, Sensitivity Bars, sandbox edits and reset, and the full joint-exploration walkthrough in a relocated app with networking disabled. Recorded the Phase 3 [requirements](dev-docs/specs/2026-11-22-add-offline-case-exploration/requirements.md) and [verification results](dev-docs/specs/2026-11-22-add-offline-case-exploration/validation.md).
- Hardened offline evaluation after review: bound applicability and exploration work at build time, reported invalid inputs even when guidance is unmet, preserved small positive scores through rounding, and distinguished true ties from spans below display precision.

## 2026-11-22

- Built and verified an offline app for the six-week follow-up decision. The generated app opens directly from disk and shows the guidance, source citation, and Do-Not-Consider Score when the source condition is met.
- Explained which source condition is unmet when the follow-up guidance does not apply, and prompted for the missing Case Input when its value is unknown.
- Added pre-build validation for Decide XML, including schema version, references, probabilities, and duplicate Case Input display labels. Corrected handling of the UTF-8 byte-order mark.
- Moved model validation and inference checks to Vitest and retained Playwright for offline browser checks. Added coverage for byte-for-byte preservation of the source XML, bundled local assets, and preservation of the existing app when a rebuild is rejected.
- Added the Apache 2.0 license.
- Moved the user specification into `dev-docs/`, updated its cross-links, and recorded the offline milestone plan, requirements, and verification results. Added local issue notes and IDE ignore rules.
- Added version 2 Decide XML for Phase 2: several Clinical Decisions grouped into topic or scenario routes, verified at build time against independently authored synthetic cases. Only verified decisions reach the app, a build with none fails without publishing, and the version 1 six-week build keeps working unchanged.
- Added numeric Case Inputs with declared units and exact source thresholds, evaluated by the same shared code at build time and offline in the browser. Missing, known-negative, and invalid values stay distinct, and the Do-Not-Consider Score appears only for applicable guidance.
- Shipped separate `coverage-report.md` and `test-report.md` files that reconcile a source inventory, explain verification failures by decision, and label incomplete builds partial. The test report covers build-time synthetic checks and does not claim browser tests ran.
- Staged builds before publication so validation or generation failures leave earlier output untouched. Reruns default to a distinct suffixed destination and print its actual entry point; `--replace` swaps a verified Decide build with rollback on failure.
- Added route and decision selection, relevant-only questions, and Case Input reuse by reference rather than display label to the generated app, with visible partial and research-only notices.
- Added the mixed-decisions synthetic fixture and its [input contract](dev-docs/specs/2026-11-22-verify-multi-decision-builds/inputs.md), and recorded Phase 2 requirements, issue notes, and [verification results](dev-docs/specs/2026-11-22-verify-multi-decision-builds/validation.md).
- Extended Vitest and offline Playwright checks for version 2 validation, numeric threshold boundaries, reports, reruns and replacement, routing, relocated builds, and model-derived scoring.

## 2026-11-21

- Added the initial Decide user specification, glossary, and README.
- Specified decision transparency requirements for source conditions, one-input-at-a-time sensitivity charts, and an interactive what-if sandbox.
- Added HeroUI dependencies and documented the project mission, roadmap, and technology stack.
- Added project agent skills and their lockfile.
