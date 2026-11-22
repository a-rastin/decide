# Decide

Decide is an agent-hosted plugin for building clinical decision support systems from Source Material. The current implementation builds a portable app from a hand-authored XML model for one synthetic Clinical Decision. Keep generated apps labeled for research with synthetic cases and use synthetic Case Inputs in fixtures and tests.

## Project references

- **Behavior changes.** Use the [user specification](dev-docs/user-specification.md) as the first-release acceptance baseline and the [roadmap](dev-docs/roadmap.md) to scope the current phase.
- **Design and terminology.** Use [GLOSSARY.md](GLOSSARY.md) for names in code, UI, and docs. Update the specification and glossary together when changing the design. Consult the [tech stack](dev-docs/tech-stack.md) when changing dependencies or build and runtime boundaries.
- **XML and fixture changes.** Read the [Decide XML schema](dev-docs/specs/2026-11-21-prove-offline-path/xml-model.md) and keep the [synthetic source](fixtures/six-week-follow-up/source.md) and [model](fixtures/six-week-follow-up/model.xml) in agreement.

## Build and runtime boundaries

- `src/build.ts` is the public build entry point. `src/read-model.ts` validates the authoritative XML before generation. Derive browser model data from the validated XML and ship the original XML alongside the app. A rejected model must leave existing output untouched.
- `src/model.ts` owns case evaluation. Keep missing Case Inputs distinct from known values that fail the source condition. Compute the Do-Not-Consider Score from the modeled action probability only when the guidance applies. Keep both quantities distinct from clinical probability.
- `src/app/` owns the shared React and HeroUI UI. Bundle code, styles, and model data locally so the generated `index.html` opens via `file://` with networking disabled, including after the output folder moves.

## Verification

Run commands from the repository root with Node.js 24 or later. Use `npm ci` to install dependencies and `npx playwright install chromium` to set up the offline browser tests. See [README.md](README.md#build-the-six-week-follow-up-example) for the sample build and custom output command.

- `npm run typecheck` checks TypeScript. `npm test` runs both suites.
- `npm run test:validation` runs Vitest. Exercise XML and output behavior through the public build command and check that case evaluation distinguishes applicable, unmet, and missing inputs.
- `npm run test:offline` runs Playwright. Exercise visible results from the generated `index.html` on disk with networking disabled. Check relocation and scoring from a varied XML model when changing the build or evaluation path.
