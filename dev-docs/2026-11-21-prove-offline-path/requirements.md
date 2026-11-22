# Phase 1 — Prove the offline path

This is the first internal milestone in the [roadmap](../roadmap.md). The [mission](../mission.md), [tech stack](../tech-stack.md), and [glossary](../../GLOSSARY.md) guide this work. The [user specification](../user-specification.md) remains the first-release acceptance baseline.

## Problem statement

Decide has a first-release specification but no implementation. Researchers cannot yet verify that guidance from Source Material survives modeling and inference and can be inspected in a generated app that works directly from disk.

## Solution

Use one short synthetic Markdown source and one explicitly authored XML model for the worked six-week follow-up example. A local build command validates the XML and generates a portable folder containing an `index.html`, the authoritative XML network, and any local assets the app needs. A researcher opens the app from disk and tries synthetic cases where the guidance applies, does not apply, or cannot yet be evaluated.

## User stories

1. As a researcher, I want a clearly labeled research-only app, so that I know it is for synthetic cases and not for clinical use.
2. As a researcher, I want to open the app from disk without a server, agent host, or internet connection, so that I can inspect the result independently of the build environment.
3. As a researcher, I want a styled, interactive control for the relevant Case Input, so that I can try the supported cases without editing the model.
4. As a researcher, I want the applicable case to show the six-week next step, so that I can check it against the Source Material.
5. As a researcher, I want to see the applicable source condition and a short citation, so that I can tell why the guidance appeared.
6. As a researcher, I want the applicable option to show a 1% Do-Not-Consider Score, so that I can see the result of the modeled action distribution.
7. As a researcher, I want that score distinguished from clinical probability and the underlying Research Modeling Convention labeled, so that I do not mistake it for the chance of a patient returning or benefiting.
8. As a researcher, I want a known negative Case Input to explain why the guidance does not apply, so that I do not mistake it for a recommendation or a scored option.
9. As a researcher, I want an unknown Case Input to identify what is missing, so that I can distinguish an unevaluated case from a negative one.
10. As a researcher, I want the XML network alongside the app, so that I can inspect the model used to generate it.
11. As a maintainer, I want invalid XML and invalid model distributions rejected before app generation, so that the build does not publish guidance based on an invalid model.
12. As a maintainer, I want to test the public build command and generated app, so that I can change internals without rewriting acceptance tests.

## Implementation decisions

- **Confirmed scope:** Hand-author a matching XML fixture. The Markdown passage defines the guidance and supports the citation; Phase 1 does not derive XML from Markdown automatically. Keep the source and model in agreement.
- Represent one Clinical Decision with one relevant Case Input whose known values establish or rule out a source applicability condition. Handle unknown as absent evidence, not as a negative value or a category in the action distribution.
- Document a minimal, versioned Decide XML schema and its model invariants. Validate structure, supported version, references, and the probability distribution before generating the app. XML is authoritative; derive the browser representation at build time and ship the XML alongside the app.
- Keep the applicability condition separate from modeled probabilities. For the applicable case, put 99% on rechecking at six weeks and 1% on deferring the timing decision, since the fixture names no other Competing Action. These are ordinary model entries under a declared Research Modeling Convention, not empirical probabilities. Derive the displayed Do-Not-Consider Score from inferred action support (`1 − 0.99`); do not hard-code the displayed score or run scoring for non-applicable or unknown cases.
- Use Node.js, npm, and TypeScript for the build. Use the shared React 19+ and TypeScript UI with HeroUI v3 and Tailwind CSS v4. Compile Tailwind before HeroUI styles in the main stylesheet. Keep app code, styles, model data, and inference local and compatible with `file://`; no CDN, runtime `fetch` of local files, or server. Choose only the build and verification tools needed for this slice.
- Show the source-supported wording, citation, and interpretation in the app. In the negative case, name the unmet condition. In the unknown case, name the missing Case Input. Neither case displays the 1% score or presents the six-week action as applicable guidance.

## Testing decisions

- **Confirmed seam:** Exercise the public build command and the generated `index.html` opened from disk with networking disabled. Add a separate build-level rejection check for invalid XML. No agent-host smoke test is required.
- Assert externally visible behavior: build status, generated artifacts, browser interaction, case results, and absence of network requests. Avoid assertions about internal module structure or brittle component markup.
- There is no existing automated test suite to extend. The roadmap exit check and the user specification’s six-week example provide the acceptance baseline.

## Out of scope

Automatic discovery or model extraction; multiple decisions, routing, or numeric thresholds; separate coverage and test report artifacts, partial-build labeling, and rebuild preservation; tornado charts and the What-If Sandbox; long-source discovery; other document formats and OCR; external evidence review and Proxy Estimates; host installation and first-release packaging. These are deferred, not removed from the release baseline.
