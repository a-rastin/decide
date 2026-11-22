# Decide

**Decide** is a plugin that helps AI agents build clinical decision support systems (CDSSs) from medical documents. Given a collection of documents — PDFs, DOCX, Markdown, or images — an agent running Decide extracts the clinical decisions described in them, builds Bayesian networks, and produces a small, self-contained web app. A researcher can open that app, enter values for a synthetic case, and see suggested next steps with the reasoning behind them.

> ⚠️ **Research project only.** Decide and the CDSSs it generates are for research with synthetic cases. They are not medical devices, are not validated for clinical use, and must not be used with real patients or real patient data.

## Status

The first implementation builds a portable app for the synthetic six-week follow-up example. The full release requirements and project vocabulary are documented in the [user specification](dev-docs/user-specification.md) and [glossary](GLOSSARY.md).

## Build the six-week follow-up example

From the repository root, use Node.js 24 or later with npm.

```sh
npm ci
npm run build
```

Open `dist/index.html` directly in a browser. The folder contains the authoritative `model.xml` and the local `app.js` and `app.css` assets. You can move the whole folder and reopen `index.html` from its new location. Choose **Yes** for the synthetic Case Input to see the six-week guidance. The [synthetic source and cases](fixtures/six-week-follow-up/source.md) document the example.

To build a copy with a different model or destination, pass the XML path and output folder in that order.

```sh
npm run build -- fixtures/six-week-follow-up/model.xml path/to/output
```

To run the automated offline checks, install Playwright's Chromium and any browser system dependencies for your platform.

```sh
npx playwright install chromium
npm run typecheck
npm test
```

The tests check the applicable case, the same app after relocation, and a temporary 95/5 XML variant. See the [Phase 1 validation record](dev-docs/2026-11-21-prove-offline-path/validation.md#task-01-verification).

## How it is meant to work

Decide is not a standalone app. A user installs it into an agent host (**Codex**, **Claude**, or **OpenCode**) and then asks the agent to build a CDSS. The agent follows one shared workflow:

1. **Intake.** Collect the *Source Material* (the documents to model) and normalize it to Markdown, keeping the originals. Minor conversion errors are tolerated; damage that could change guidance is checked against the original.
2. **Discovery.** Inventory every clinical decision in the material — even a whole book — including decisions embedded in tables, figures, and footnotes. Large sources are mapped and processed section by section with resumable progress.
3. **Evidence.** Identify the variables that drive each decision, resolve conflicts, and fill evidence gaps with bounded searches of external medical sources. Numbers that do not directly match the target population may be used as labeled *Proxy Estimates*.
4. **Modeling.** Build one or more Bayesian networks, serialized as schema-validated XML. The XML is authoritative; anything the browser needs at runtime is derived from it.
5. **Generation.** Emit a portable folder with an `index.html` that opens directly from disk — no server, internet, AI API, or agent host required — plus the XML networks and coverage and test reports.

The generated app will use a shared React UI built with HeroUI, with all assets shipped locally. It routes large systems by topic or scenario, asks only for the *Case Inputs* relevant to the selected decision, and distinguishes an unknown input from a negative one. Each suggestion shows why it appeared, a short citation, and any missing inputs.

### A note on probabilities

The spec keeps three quantities separate: **clinical probabilities** (estimated chance of a condition or outcome), **action probabilities** (modeled support for a guidance option, sometimes from a declared *Research Modeling Convention*), and the **Do-Not-Consider Score** (an app-facing value where higher means stronger support for *not* considering an option). Conflating them is a common source of confusion — see the worked six-week follow-up example in [`user-specification.md`](dev-docs/user-specification.md).

### Coverage is explicit

Decide reports modeled decisions, *Unresolved Decisions*, and unreadable sections separately. A partial build can be delivered for the decisions that pass synthetic-case tests, but it is labeled partial; passing tests never implies the whole source was modeled.

## Repository contents

| File | Purpose |
| --- | --- |
| [`dev-docs/user-specification.md`](dev-docs/user-specification.md) | Normative specification of the plugin, workflow, and generated CDSS. |
| [`GLOSSARY.md`](GLOSSARY.md) | Canonical project terms and the words to avoid. |
| [`dev-docs/mission.md`](dev-docs/mission.md) | Project mission and guiding principles. |
| [`dev-docs/tech-stack.md`](dev-docs/tech-stack.md) | Implementation stack and runtime constraints. |
| [`dev-docs/roadmap.md`](dev-docs/roadmap.md) | Small implementation phases with exit checks. |

## Contributing

When changing the design, update `dev-docs/user-specification.md` and `GLOSSARY.md` together. Introduce a glossary term when a concept is resolved, and keep implementation details out of the glossary.
