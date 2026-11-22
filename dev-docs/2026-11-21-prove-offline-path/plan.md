# Phase 1 implementation plan

Use [requirements.md](requirements.md) for scope and [validation.md](validation.md) for merge criteria.

## 1. Define the fixture and XML contract

- [ ] Write one short synthetic Markdown passage with an explicit condition for rechecking at six weeks. Define its short citation and the three synthetic cases.
- [x] Document the [initial Decide XML schema version](xml-model.md) and the invariants the build enforces.
- [ ] Author the matching XML fixture, with the applicability condition, declared Research Modeling Convention, and mutually exclusive action distribution.

## 2. Build validation and case evaluation

- [x] Add a public npm build command that validates the model before deriving the browser representation from XML.
- [ ] Implement inference for the supported model and distinguish applicable, not applicable, and unknown inputs. Compute the Do-Not-Consider Score only for the applicable case.
- [x] Add build-level rejection cases for invalid XML structure and invalid model probabilities.

## 3. Generate the offline CDSS

- [ ] Build a shared React and TypeScript view with a styled HeroUI Case Input control, a research-only notice, and result states that satisfy the requirements.
- [ ] Bundle the app, styles, inference, and model data locally. Emit `index.html` and ship the authoritative XML alongside it.
- [ ] Document how to generate the artifact and open it from disk.

## 4. Verify the slice and prepare it for review

- [ ] Automate the three synthetic cases against the generated app and exercise the control with networking disabled.
- [ ] Check portability by moving the generated folder and opening its entry point from disk without a development server.
- [ ] Record the commands and verification results for review and check the phase against the merge criteria.
