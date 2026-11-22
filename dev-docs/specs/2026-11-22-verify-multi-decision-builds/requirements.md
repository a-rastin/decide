# Phase 2 — Verify multi-decision builds

This is the next internal milestone in the [roadmap](../../roadmap.md), not a change to first-release scope. The [user specification](../../user-specification.md) is the acceptance baseline. Follow the [mission](../../mission.md), [tech stack](../../tech-stack.md), and [glossary](../../../GLOSSARY.md).

## Problem statement

Phase 1 proves that one Clinical Decision with one categorical Case Input can run offline. A researcher cannot yet use a build covering several decisions, tell which parts of the Source Material are missing or failed verification, or rerun a successful build without risking the previous artifact.

## Solution

Build one portable CDSS from a hand-authored inventory, versioned XML, and synthetic verification cases. Report coverage separately from test results. Show only verified guidance and mark incomplete delivery as partial. Route multi-topic or multi-scenario builds before asking case questions. Preserve previous builds by default.

## User stories

1. As a researcher, I want to choose a topic or scenario before answering questions, so that I can find the Clinical Decision I want to explore.
2. As a researcher, I want to see only Case Inputs relevant to the selected decision, so that I am not asked unrelated questions.
3. As a researcher, I want matching inputs reused across decisions, so that I do not have to re-enter the same synthetic values.
4. As a researcher, I want same-named inputs with different meanings kept separate, so that navigation does not change the interpretation of my case.
5. As a researcher, I want numeric inputs labeled with their units and evaluated at the exact source threshold, so that boundary cases behave as the Source Material specifies.
6. As a researcher, I want missing, known negative, and invalid inputs to be distinguishable, so that I can tell what prevented a result.
7. As a researcher, I want the next step, source condition, and short citation together, so that I can check why guidance appeared.
8. As a researcher, I want the relevant missing Case Inputs identified, so that I know what is still needed without losing guidance for unrelated decisions.
9. As a researcher, I want the Do-Not-Consider Score shown only when the guidance applies and distinguished from clinical probability, so that I do not misread the result.
10. As a researcher, I want the coverage report to distinguish modeled decisions, Unresolved Decisions, and unreadable or unprocessed sections, so that I can see what the build does not cover.
11. As a build author, I want a separate test report with failures tied to decisions, so that I know what to fix without mistaking a passing test for source coverage.
12. As a researcher, I want a visible partial-build notice and no usable guidance from omitted decisions, so that I cannot mistake a subset for a complete CDSS.
13. As a build author, I want the build to withhold the app if no decision verifies, so that a failed run cannot be mistaken for a deliverable.
14. As a build author, I want successful reruns to publish separately unless I request replacement, so that I can compare builds and keep a known-good copy.
15. As a build author, I want failed reruns to leave existing output untouched, so that an error does not take away a usable build.
16. As a researcher, I want the original XML and both reports alongside a relocatable, research-only app, so that I can inspect the build offline without an agent or a server.

## Implementation decisions

- **Inputs and scope.** Use a short synthetic Markdown fixture with an explicit inventory of its Clinical Decisions and any unreadable or unprocessed sections. Link entries, model decisions, and verification results with stable decision identifiers. Include a passing categorical decision, a passing numeric-threshold decision, an Unresolved Decision with no model, and a validly modeled decision that deliberately fails a synthetic check. Hand-author these inputs; do not add source discovery or search.
- **Authoritative model.** Document a versioned XML extension for multiple Clinical Decisions, explicit topic or scenario grouping, Case Input references, and source-defined numeric thresholds with units and comparison operators. Continue accepting the Phase 1 XML and public build invocation. Validate structure, supported versions, references, numeric definitions, and model invariants before generation; malformed or invalid XML rejects the build rather than becoming a partial-build exclusion. Ship the original validated XML and derive the browser model from it. A validated model is not necessarily verified guidance.
- **Evaluation.** Use the same evaluator in build-time checks and the browser. Unknown is absent evidence, not no or zero. Reject invalid numeric entries without coercing them into valid values or showing a stale result. Evaluate valid values in the displayed unit without rounding across a source boundary. Show the source condition, citation, and relevant missing inputs as appropriate. Score only applicable guidance, and label any Research Modeling Convention without equating the score to clinical probability.
- **Verification gate.** Compare each modeled decision against independently authored expected outcomes for applicable, unmet, and missing cases, including expected guidance and score where applicable. Numeric cases include the threshold and values on both sides. A failed check or insufficient case coverage excludes that decision; it must not appear as usable guidance even if its XML ships for inspection. If no decision passes, fail with decision-specific diagnostics and publish no app. Browser checks gate the phase merge; generated reports must not claim browser checks ran if they did not.
- **Reports and partial builds.** Ship two separately readable reports. Coverage accounts for the inventory and source sections, identifying which decisions were verified and delivered, modeled but excluded after verification, or unresolved without a model. The test report gives each modeled decision's verification outcome and explains failures with the relevant case and expected versus actual result; unmodeled decisions are not tested. Label the app and coverage report partial when verified delivery excludes an in-scope decision or any source section remains unreadable or unprocessed.
- **Routing and input reuse.** When a build has multiple topic or scenario routes, show routing before case questions. Let users select a verified Clinical Decision within the chosen route; preserve the direct single-decision flow. Show only inputs relevant to the selected decision. Reuse a value within the current synthetic case only when decisions reference the same declared Case Input with the same meaning, units, and value domain; do not match fields by display label. Unknown or unmet states for one decision do not hide other verified decisions. Do not infer urgency.
- **Publication.** A successful rerun targeting an occupied destination creates a distinct output folder and reports the actual entry-point path. Build and verify before publishing a complete artifact. Replace an existing build only on explicit request and preserve it if validation, verification, generation, or publication fails. A rejected run must not leave a usable-looking partial artifact at the destination.
- **Runtime.** Keep the shared React and TypeScript UI with HeroUI v3 and compiled local styles. Bundle model data and evaluation logic locally; no runtime fetch of the reports or XML, network access, server, or agent host is needed. Label the app for research with synthetic cases, not clinical use.

## Testing decisions

Use the existing public build command in Vitest to check diagnostics, reports, and on-disk output. Use the shared evaluator's existing seam for focused case-state and threshold regressions. Use Playwright through the generated `file://` entry point for routing, visible guidance, and portability; assert user-visible outcomes rather than component internals. Extend the [Phase 1 verification approach](../2026-11-21-prove-offline-path/validation.md). See [validation.md](validation.md) for merge criteria.

## Out of scope

Tornado charts and the What-If Sandbox; automated discovery and resumable long-source processing; DOCX, PDF, image intake and OCR; external evidence review and Proxy Estimates; agent-host installation and release packaging; real patient data or clinical use. This phase verifies software behavior against synthetic expectations, not clinical validity.
