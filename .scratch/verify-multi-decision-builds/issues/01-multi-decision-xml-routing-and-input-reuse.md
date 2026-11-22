# 01: Multi-decision XML v2, topic routing, and shared Case Input reuse

**What to build:** A build author can validate a versioned multi-decision XML model alongside the existing Phase 1 XML format, and a researcher opening the generated offline app can choose a topic or scenario route before answering questions, see only the Case Inputs relevant to the selected Clinical Decision, reuse values across decisions that reference the same declared Case Input, and keep same-labeled distinct inputs separate.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Document the versioned multi-decision XML extension (covering multiple Clinical Decisions, explicit topic or scenario grouping, and Case Input references) while continuing to accept the Phase 1 XML and public build invocation.
- [ ] Validate XML structure, supported versions, references, and model invariants before generation, rejecting malformed or invalid XML (and ensuring unsupported-version tests use a version that remains unsupported).
- [ ] Present topic or scenario routing before case questions in multi-route builds while preserving the direct single-decision flow for single-decision builds.
- [ ] Show only Case Inputs relevant to the selected Clinical Decision, reusing a synthetic value across decisions only when they reference the same declared Case Input (matching meaning, units, and value domain) and never by display label.
- [ ] Keep unknown or unmet states for one decision from hiding other verified decisions, and render the next step, source condition, citation, relevant missing inputs, and model-derived Do-Not-Consider Score (distinct from clinical probability) when applicable.
- [ ] Verify the Phase 1 six-week fixture regression and a multi-route categorical fixture through Vitest and offline `file://` Playwright checks with zero network requests.
