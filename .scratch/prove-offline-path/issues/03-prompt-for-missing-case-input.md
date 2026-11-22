# 03: Prompt for missing Case Input

**What to build:** A researcher can indicate that the relevant Case Input is unknown and see which value is needed to evaluate the six-week follow-up guidance.

**Blocked by:** [01 — Show the six-week follow-up in an offline app](01-show-the-six-week-follow-up-offline.md).

**Status:** ready-for-agent

- [ ] The Case Input control supports an unknown state. Evaluation treats it as absent evidence, and the result names the missing input or prompts for it. The action distribution contains only modeled actions.
- [ ] For this case, the app presents no applicable six-week recommendation and computes or displays no Do-Not-Consider Score.
- [ ] An automated browser check switches from the applicable case to unknown through the visible control in the same `file://` artifact with networking disabled. Verify that the prior recommendation and score clear and that the result identifies missing evidence rather than an unmet condition. Record the reproduction command and result.

[Phase 1 requirements](../../../dev-docs/2026-11-21-prove-offline-path/requirements.md) · [Merge criteria](../../../dev-docs/2026-11-21-prove-offline-path/validation.md)
