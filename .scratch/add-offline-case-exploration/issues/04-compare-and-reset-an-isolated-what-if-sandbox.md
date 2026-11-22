# 04: Compare and reset an isolated What-If Sandbox

**What to build:** A researcher can compare the current original synthetic case with a separately editable variant in the offline app, including when the original cannot be scored.

**Blocked by:** 02: Evaluate and verify routed multi-input Clinical Decisions

**Status:** ready-for-agent

- [ ] Opening the sandbox copies current original inputs for the selected decision. Permit edits to multiple relevant inputs and allow clearing values. Use the shared evaluator for both sides without changing model assumptions.
- [ ] Show labeled original and variant guidance, source reason, citation, relevant missing inputs, and available scores. Show a numerical difference only when both sides have scores for the same option; otherwise explain why comparison is unavailable.
- [ ] Variant edits do not write to the original. Original edits do not overwrite an open draft. Reset copies the current original into the variant, and switching decisions discards the old draft while retaining original input reuse by ID.
- [ ] Verify the joint edit and reset in the generated offline app, including an unscoreable original and a scoreable variant. Keep the labels clear when stacked at narrow widths and make controls and comparison content usable with the keyboard.
- [ ] Legacy Clinical Decisions also offer the sandbox without changing their evaluation semantics. Do not persist case data outside the open app.
