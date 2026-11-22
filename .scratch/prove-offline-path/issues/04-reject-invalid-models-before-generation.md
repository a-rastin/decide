# 04: Reject invalid models before generating the app

**What to build:** A maintainer gets a useful error from the public npm build command when the supplied XML model violates the Decide contract, before the build generates an app from that model.

**Blocked by:** [01 — Show the six-week follow-up in an offline app](01-show-the-six-week-follow-up-offline.md).

**Status:** ready-for-agent

- [ ] Document the supported Decide XML schema version and model invariants for structure, references, and the mutually exclusive action distribution.
- [ ] Validate the XML against that contract before deriving the browser representation or generating the app.
- [ ] Automated checks invoke the public build command with malformed XML, structurally invalid XML, invalid references, an unsupported schema version, and structurally valid XML with an invalid action distribution. Each run exits unsuccessfully, identifies the cause, and generates no new app from the rejected model.
- [ ] The original fixture still builds with the same command. Record the reproduction commands and results.

[Phase 1 requirements](../../../dev-docs/2026-11-21-prove-offline-path/requirements.md) · [Merge criteria](../../../dev-docs/2026-11-21-prove-offline-path/validation.md)
