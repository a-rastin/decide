# Phase 3 — Add offline case exploration

[Plan](plan.md) · [Validation](validation.md)

## Problem statement

A researcher can open a verified Decide build and evaluate a synthetic case, but cannot tell which Case Inputs change the Do-Not-Consider Score or try a different scenario without editing the original. Phase 2 groups Clinical Decisions by route, but each decision still uses one Case Input and a fixed action probability. That model cannot express a joint dependency or demonstrate a nonzero Sensitivity Bar.

## Solution and scope

Give each delivered Clinical Decision a tornado chart and a What-If Sandbox in the generated offline app. Expand the model to versioned Bayesian networks that support multiple observed inputs, latent variables, dependent nodes, and conditional action probabilities. Keep applicability separate from inference, and leave the original synthetic case and model assumptions unchanged by exploration.

This is [Phase 3 of the roadmap](../../roadmap.md), following the merged [Phase 2 input contract](../2026-11-22-verify-multi-decision-builds/inputs.md). The [mission](../../mission.md), [tech stack](../../tech-stack.md), [user specification](../../user-specification.md), and [glossary](../../../GLOSSARY.md) govern the design. The app remains research-only and must not request real patient data. XML remains authoritative and the app runs without networking, a server, or an agent host.

## User stories

1. As a researcher, I want to choose a topic or scenario and then a Clinical Decision, so that I see only relevant Case Inputs and exploration tools.
2. As a researcher, I want entered values reused only when decisions reference the same Case Input, so that similarly labeled observations do not get copied by mistake.
3. As a researcher, I want to see why the selected guidance appeared and where it came from, so that I can inspect it before exploring alternatives.
4. As a researcher, I want each Sensitivity Bar to change one Case Input at a time, so that I can isolate modeled score changes from joint changes.
5. As a researcher, I want every modeled category tested, so that an unfavorable or inapplicable alternative is not silently dropped.
6. As a researcher, I want numeric tests grounded in declared ranges and thresholds and labeled with their exact values and units, so that I can see what the chart actually tested.
7. As a researcher, I want inapplicable alternatives to identify the source condition and show no score, so that I do not mistake inapplicability for a low score.
8. As a researcher, I want missing, invalid, and unmet states distinguished, so that I know whether to supply a value, correct it, or read the condition.
9. As a researcher, I want an explanation when no meaningful comparison is possible and an explicit indication of unchanged scores when a comparison is possible, so that neither looks like missing data or an invented zero.
10. As a researcher, I want to see tested values and results without relying on color or hover, so that I can inspect the chart with a keyboard or assistive technology.
11. As a researcher, I want to change multiple inputs in a separate sandbox even if the original cannot be scored, so that I can try a valid synthetic scenario.
12. As a researcher, I want original and what-if guidance side by side, so that I can see differences without confusing the two cases.
13. As a researcher, I want to reset the variant to the original inputs, so that I can start again without changing the original or its chart.
14. As a researcher, I want to move the entire app folder and still explore cases offline, so that the build is useful away from the build machine.
15. As a model author, I want to express dependencies among inputs, latent variables, and action probabilities in XML, so that meaningful case comparisons do not require hard-coded scores.
16. As a model author, I want the build to reject inconsistent networks and report verification failures by Clinical Decision, so that a malformed model cannot replace a working artifact and unverified guidance is not offered.
17. As a model author, I want existing XML and verification inputs to keep working, so that adopting the new model format is optional.

## Implementation decisions

### Model and evaluation

- Introduce Decide XML v3. A model can contain one or more finite discrete Bayesian networks, each a directed acyclic graph with root priors and a complete conditional probability table for each non-root node. Support multi-parent dependencies, latent nodes, and reuse of a network across decisions. Each Clinical Decision names its action node, its source-selected guidance option, the Case Inputs relevant to it, and its applicability rule with source condition and short citation. Do not choose guidance merely by taking the highest posterior. Only mutually exclusive Competing Actions share an action distribution.
- Bind each scoring Case Input to an observed node. Categorical values map to declared states; numeric values map to nonoverlapping, exhaustive threshold partitions of the accepted numeric domain in the declared unit. Compare decimal boundaries exactly, including equality. Keep numeric chart sampling declarations separate from what the evaluator accepts as evidence: a chart interval is not an input validity rule.
- Validate references, state mappings, partition boundaries, acyclicity, and complete, unique, normalized probability rows before generation. Reject non-finite or out-of-range probabilities. Derive browser data only from validated XML and ship the original XML unchanged. Preserve v1 and v2 XML, public invocation, case results, and reports where currently emitted; do not silently reinterpret legacy applicability or scores.
- Evaluate explicit categorical and numeric applicability predicates independently of the network; support conjunction and disjunction. A known false conjunction or known true disjunction is decisive even with an unknown operand; report relevant missing Case Inputs only when they can still affect the result. Mark invalid entries distinctly and do not coerce them to unknown or to a number. An unmet condition names the source condition and has no score; an indeterminate condition does not assert applicable guidance.
- For applicable guidance, compute the action posterior from the decision's declared evidence and use its complement as the Do-Not-Consider Score for the same option. Use exact inference rather than sampling for supported finite models, marginalizing latent nodes and unentered optional observations. Document and validate any inference size limits at build time so that the browser is not the first place an unsupported network fails. A decision may explicitly require an observation before scoring; if it is absent, identify it and retain independently supported guidance without a score. If evidence has zero probability, explain that no score can be computed rather than returning zero or `NaN`. Keep clinical probabilities, action probabilities, and Do-Not-Consider Scores distinct. Reuse this evaluator for the original result, chart, sandbox, and build-time verification.
- Keep Phase 2 publication and reporting guarantees. Invalid XML or network invariants reject the build without changing existing output. A failed decision in an otherwise structurally valid build is excluded from usable guidance and reported by decision; a build without verified decisions is not published. Coverage and test reports remain separate; the latter must not claim Playwright ran at build time. Preserve partial labeling and non-destructive reruns.

### Tornado chart

- Use the current original case as the baseline and keep the selected guidance option, all other Case Inputs, and the model fixed for each run. Test every modeled categorical value; the built-in missing selection is not a modeled category. For numeric inputs, use an explicitly authored finite set of values within a declared interval and cover the in-range applicable model and source thresholds using values below, exactly at, and above each threshold wherever the interval permits. Reject inconsistent declarations; if no numeric sampling declaration exists, explain why the input was not varied. Never invent bounds or test points.
- Show tested values, units where relevant, and per-value scores or reasons no score exists. Range endpoints use only evaluated, comparable scores for the same option. Sort bars by descending score span with a stable tie order. Use an accessible text or table equivalent and explain that the chart describes model sensitivity, not causation.
- Require a scoreable baseline and at least two distinct scoreable tested values for an input's range. If equal scores are genuinely comparable, label them as no modeled change and show the common score; do not fabricate a span. When no input supports comparison, give the reason instead of drawing an empty chart or treating missing, invalid, or inapplicable evidence as zero. Keep the sandbox available.

### What-If Sandbox

- Initialize an independent variant from the current original inputs when opening the sandbox for a decision. Permit edits to multiple relevant inputs, including clearing values. Compute each side through the same evaluator and show guidance, source reason, citation, relevant missing inputs, and scores when available. Do not show a numerical difference unless both sides have scores for the same option; explain unavailable comparisons.
- Keep the sandbox draft separate from original edits and the chart. Reset copies the current original inputs into the variant without writing to the original or model. Switching Clinical Decisions discards the draft; an original Case Input may still be reused by ID across decisions. Keep both sides clearly labeled, including when stacked at narrow widths.
- Use the shared React and HeroUI app and bundle code, styles, and model data locally. No chart CDN, runtime model fetch, or storage of case data outside the open app is needed.

## Testing decisions

Use the public build and its generated `file://` app as the primary seam. Extend the existing offline and relocation Playwright approach with synthetic fixtures and observable outcomes, not component state or chart-library internals. Use Vitest through the public build for rejected XML, verification failures, and publication behavior, and focused evaluator tests for exact inference, zero-likelihood evidence, and threshold edges. See [validation.md](validation.md) for merge criteria.

## Out of scope

Continuous probability distributions, parameter learning, causal or interventional claims, influence diagrams or utility optimization, network editing in the browser, and user-facing clinical probability exploration. Also out of scope: automated discovery, document conversion, external evidence review, proxy sensitivity during the build, and agent-host packaging. This phase verifies synthetic software behavior, not clinical validity.
