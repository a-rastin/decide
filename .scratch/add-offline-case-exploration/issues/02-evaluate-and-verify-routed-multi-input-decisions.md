# 02: Evaluate and verify routed multi-input Clinical Decisions

**What to build:** A researcher can select a route and verified Clinical Decision, enter only its relevant Case Inputs, and see source-supported guidance and a score when available. Multiple decisions can reuse a network and share original values only by Case Input ID.

**Blocked by:** 01: Build and score one XML v3 Clinical Decision offline

**Status:** ready-for-agent

- [ ] Exercise a routed synthetic build with multiple decisions, a network reused across decisions, one shared Case Input, an unrelated input with the same label as another input, and a multi-parent dependency. Verify visible routing and reuse offline.
- [ ] Evaluate conjunctions and disjunctions separately from inference. A known false conjunction or true disjunction is decisive despite an unanswered operand. Distinguish missing, invalid, and unmet states; surface only missing inputs that can still affect the result. Show the source condition and citation and do not score unmet guidance.
- [ ] Use only declared evidence for each decision. Marginalize unentered optional observations. An absent required score input or zero-likelihood evidence preserves independently supported guidance, explains why the score is unavailable, and never produces zero or `NaN` as a fallback.
- [ ] Use independently authored expected results and coverage checks. A mismatch identifies the case and Clinical Decision in the test report, excludes the failed decision from usable guidance, and visibly labels a mixed build partial. If none verify, publish nothing.
- [ ] Keep coverage separate from test results, which must not claim Playwright ran during the build. Verify that a successful default rerun preserves the previous artifact.
