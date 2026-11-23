# 06: Add authored numeric sweeps to the tornado chart

**What to build:** A researcher can inspect numeric Sensitivity Bars based on explicitly authored samples, with exact values and units, in the generated offline app.

**Blocked by:** 03: Score numeric Case Inputs at exact thresholds; 05: Show categorical Sensitivity Bars and explain unavailable comparisons

**Status:** ready-for-agent

- [ ] Document and validate an explicitly authored finite set of test values within a declared interval. Cover applicable in-range model and source thresholds with samples below, exactly at, and above each threshold wherever the interval permits.
- [ ] Reject inconsistent sampling declarations before generation without changing previous output. A missing declaration does not invalidate case values or invent bounds or test points; explain why that input was not varied.
- [ ] Show exact tested values, units, and a score or reason no score is available for each sample. Verify independently derived results with all other inputs fixed, and exclude noncomparable samples from range endpoints.
- [ ] Show numeric and categorical comparisons together using the same ranking, equal-score, and accessible presentation rules.
