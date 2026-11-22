# 02: Numeric-threshold Case Inputs with units and boundary evaluation

**What to build:** A researcher can enter numeric Case Inputs labeled with their declared units and see exact boundary evaluation against the Source Material's threshold and comparison operator without rounding across boundaries, with blank treated as missing and invalid entries flagged without coercing them or leaving a stale score.

**Blocked by:** 01: Multi-decision XML v2, topic routing, and shared Case Input reuse

**Status:** ready-for-agent

- [ ] Extend XML validation to support source-defined numeric Case Inputs with declared units, thresholds, and comparison operators, rejecting invalid threshold definitions or incompatible input references before generation.
- [ ] Extend the shared evaluator (used at both build time and in the browser) to evaluate numeric values in the displayed unit against the exact declared threshold and comparison operator without rounding across a source boundary.
- [ ] Distinguish missing (blank), known negative/unmet, and invalid numeric entries in both the evaluator and the offline UI—never treating blank as zero or no, and never coercing invalid input into a valid value or showing a stale applicable result or score.
- [ ] Display the model's declared units on numeric Case Input controls in the offline app and show the source condition, citation, relevant missing inputs, or model-derived Do-Not-Consider Score as appropriate.
- [ ] Verify numeric boundary behavior (below, exactly at, and above threshold), blank-as-missing, and invalid-input handling through focused evaluator tests, build validation tests, and offline `file://` Playwright checks.
