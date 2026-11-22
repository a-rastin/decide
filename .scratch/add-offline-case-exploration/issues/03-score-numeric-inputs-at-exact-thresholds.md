# 03: Score numeric Case Inputs at exact thresholds

**What to build:** A researcher can enter numeric Case Inputs in the declared units and see original-case guidance and scores that respect exact source and model thresholds.

**Blocked by:** 02: Evaluate and verify routed multi-input Clinical Decisions

**Status:** ready-for-agent

- [ ] Document and validate numeric observation bindings and nonoverlapping, exhaustive threshold partitions of the accepted input domain. Reject gaps, overlaps, and invalid state mappings before publication without changing previous output.
- [ ] Evaluate numeric applicability and state mapping at exact decimal boundaries, including equality. Distinguish invalid from missing values, and keep accepted values independent of any chart sampling interval.
- [ ] In the public build and generated offline app, verify independently derived outcomes below, at, and above each relevant threshold. Show declared units and distinguish invalid and missing values from known unmet conditions.
