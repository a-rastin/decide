# 01: Show the six-week follow-up in an offline app

**What to build:** A researcher can build a portable Decide app from a hand-authored XML model, open it from disk, and evaluate a synthetic case that meets the Source Material’s six-week follow-up condition.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Write a short synthetic Markdown passage stating the condition for rechecking at six weeks. Define a short citation and three synthetic cases covering met, unmet, and unknown input.
- [ ] Author a matching versioned XML model of one Clinical Decision and one relevant Case Input. Keep applicability separate from the mutually exclusive action distribution. Declare the Research Modeling Convention and assign 99% to rechecking at six weeks and 1% to deferring the timing decision.
- [ ] From a clean checkout, install locked dependencies and use the documented public npm build command to generate a portable folder with `index.html`, the authoritative XML, and all required local assets. Use Node.js and TypeScript for the build, and derive the app’s model data from XML at build time.
- [ ] Use the shared React and TypeScript view with a visibly styled HeroUI v3 Case Input control, Tailwind CSS v4 compiled before HeroUI styles, and a visible research-only, not-for-clinical-use notice.
- [ ] Selecting the applicable Case Input shows the six-week action, the applicable source condition, the matching short citation, and a 1% Do-Not-Consider Score derived from inferred action support. Label the Research Modeling Convention and explain what the score represents.
- [ ] Using the same app code with a temporary 95/5 XML variant displays a 5% score. Keep the acceptance fixture at 99/1.
- [ ] Automate the applicable case through the visible UI with networking disabled. Confirm the app makes zero network requests. Move the output folder and repeat the open-and-interact check from `file://` without a server or agent host. Record reproduction commands, results, and any manual checks.

[Phase 1 requirements](../../../dev-docs/2026-11-21-prove-offline-path/requirements.md) · [Merge criteria](../../../dev-docs/2026-11-21-prove-offline-path/validation.md)
