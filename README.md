# Decide

**Decide** is a plugin that helps AI agents build clinical decision support systems (CDSSs) from medical documents. Given a collection of documents — PDFs, DOCX, Markdown, or images — an agent running Decide extracts the clinical decisions described in them, builds Bayesian networks, and produces a small, self-contained web app. A researcher can open that app, enter values for a synthetic case, and see suggested next steps with the reasoning behind them.

> ⚠️ **Research project only.** Decide and the CDSSs it generates are for research with synthetic cases. They are not medical devices, are not validated for clinical use, and must not be used with real patients or real patient data.

## Status

This repository is at the **specification stage**: it contains the design and the project vocabulary, but no implementation yet. The normative description of what Decide must do is [`user-specification.md`](user-specification.md); the agreed terminology lives in [`GLOSSARY.md`](GLOSSARY.md). Installation instructions, the agent prompt, and the one-line installer will appear here once they exist.

## How it is meant to work

Decide is not a standalone app. A user installs it into an agent host (**Codex**, **Claude**, or **OpenCode**) and then asks the agent to build a CDSS. The agent follows one shared workflow:

1. **Intake.** Collect the *Source Material* (the documents to model) and normalize it to Markdown, keeping the originals. Minor conversion errors are tolerated; damage that could change guidance is checked against the original.
2. **Discovery.** Inventory every clinical decision in the material — even a whole book — including decisions embedded in tables, figures, and footnotes. Large sources are mapped and processed section by section with resumable progress.
3. **Evidence.** Identify the variables that drive each decision, resolve conflicts, and fill evidence gaps with bounded searches of external medical sources. Numbers that do not directly match the target population may be used as labeled *Proxy Estimates*.
4. **Modeling.** Build one or more Bayesian networks, serialized as schema-validated XML. The XML is authoritative; anything the browser needs at runtime is derived from it.
5. **Generation.** Emit a portable folder with an `index.html` that opens directly from disk — no server, internet, AI API, or agent host required — plus the XML networks and coverage and test reports.

The generated app uses a shared UI, routes large systems by topic or scenario, asks only for the *Case Inputs* relevant to the selected decision, and distinguishes an unknown input from a negative one. Each suggestion shows why it appeared, a short citation, and any missing inputs.

### A note on probabilities

The spec keeps three quantities separate: **clinical probabilities** (estimated chance of a condition or outcome), **action probabilities** (modeled support for a guidance option, sometimes from a declared *Research Modeling Convention*), and the **Do-Not-Consider Score** (an app-facing value where higher means stronger support for *not* considering an option). Conflating them is a common source of confusion — see the worked six-week follow-up example in [`user-specification.md`](user-specification.md).

### Coverage is explicit

Decide reports modeled decisions, *Unresolved Decisions*, and unreadable sections separately. A partial build can be delivered for the decisions that pass synthetic-case tests, but it is labeled partial; passing tests never implies the whole source was modeled.

## Repository contents

| File | Purpose |
| --- | --- |
| [`user-specification.md`](user-specification.md) | Normative specification of the plugin, workflow, and generated CDSS. |
| [`GLOSSARY.md`](GLOSSARY.md) | Canonical project terms and the words to avoid. |

## Contributing

When changing the design, update `user-specification.md` and `GLOSSARY.md` together. Introduce a glossary term when a concept is resolved, and keep implementation details out of the glossary.
