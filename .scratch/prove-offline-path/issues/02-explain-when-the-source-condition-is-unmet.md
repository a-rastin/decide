# 02: Explain when the source condition is unmet

**What to build:** A researcher can enter a known negative Case Input in the generated app and see which source condition rules out the six-week follow-up guidance.

**Blocked by:** [01 — Show the six-week follow-up in an offline app](01-show-the-six-week-follow-up-offline.md).

**Status:** resolved

- [x] The Case Input control accepts the known value that rules out the source condition. The result names the unmet condition.
- [x] For this case, the app presents no applicable six-week recommendation and computes or displays no Do-Not-Consider Score.
- [x] An automated browser check switches from the applicable case to the known negative case through the visible control in the same `file://` artifact with networking disabled. Verify that the prior recommendation and score clear and record the reproduction command and result.

[Phase 1 requirements](../../../dev-docs/2026-11-21-prove-offline-path/requirements.md) · [Merge criteria](../../../dev-docs/2026-11-21-prove-offline-path/validation.md)

## Answer

Selecting **No** shows the unmet source condition and citation and clears the previous recommendation and score. The [Task 02 verification record](../../../dev-docs/2026-11-21-prove-offline-path/validation.md#task-02-verification) documents the offline check and reproduction command.
