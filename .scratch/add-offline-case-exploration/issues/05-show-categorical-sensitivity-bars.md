# 05: Show categorical Sensitivity Bars and explain unavailable comparisons

**What to build:** A researcher can inspect an offline tornado chart showing how changing one categorical Case Input at a time affects the selected option's Do-Not-Consider Score in the original synthetic case.

**Blocked by:** 02: Evaluate and verify routed multi-input Clinical Decisions

**Status:** ready-for-agent

- [ ] Evaluate each modeled category, excluding the built-in missing selection. Hold all other original Case Inputs, the selected option, and model assumptions fixed. Verify sample scores against independently derived results.
- [ ] Show every tested category and its score or reason no score is available. Name the source condition for inapplicable samples and exclude them from range endpoints. Never treat an unavailable score as zero.
- [ ] Require a scoreable baseline and at least two distinct tested values with comparable scores for a bar. Sort by descending span with stable tie order; label equal comparable scores as no modeled change and show the common score.
- [ ] When no comparison is meaningful, including for legacy decisions without meaningful variation, explain why instead of drawing an empty chart or retaining a stale range. Do not use chart availability to gate the sandbox.
- [ ] Provide an accessible text or table equivalent that does not rely on color or hover, and explain that the chart describes model sensitivity, not causation.
