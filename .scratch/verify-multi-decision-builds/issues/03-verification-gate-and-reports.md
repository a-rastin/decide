# 03: Verification gate, mixed fixture, and separate coverage & test reports

**What to build:** A build author can run the public build command with a mixed synthetic fixture (Markdown Source Material, explicit inventory, versioned XML, and independently authored verification cases) to gate delivery on build-time verification, exclude failing or under-tested decisions from usable guidance, fail with no app if zero decisions verify, and ship separate coverage and test reports plus a visible partial-build notice when delivery is incomplete.

**Blocked by:** 02: Numeric-threshold Case Inputs with units and boundary evaluation

**Status:** ready-for-agent

- [ ] Author the mixed synthetic fixture with matching Source Material Markdown, an explicit inventory (including a passing categorical decision, a passing numeric-threshold decision, an Unresolved Decision with no model, and an unreadable or unprocessed section), versioned XML, and independently authored expected case results (including a modeled decision with a deliberate verification mismatch and numeric boundary cases on both sides of the threshold).
- [ ] Run build-time verification using the shared evaluator against each modeled decision's expected applicable, unmet, and missing outcomes; exclude any decision with a failed check or insufficient case coverage from the browser model, and fail without publishing an app (naming the affected decisions) if no decision verifies.
- [ ] Generate a coverage report that reconciles the authored inventory—identifying verified and delivered decisions, modeled but excluded decisions, Unresolved Decisions without a model, and unreadable or unprocessed sections separately—and marks the build partial whenever any in-scope decision or source section is excluded or unresolved (and not partial when all-passing and fully covered).
- [ ] Generate a separate test report giving each modeled decision's verification outcome, explaining failures with the relevant case and expected versus actual result, not counting unmodeled decisions as passing, and not claiming browser checks ran if they did not.
- [ ] Display a visible partial-build notice alongside the research-only notice in the offline app when delivery is incomplete, and ensure excluded decisions do not appear as usable guidance even though the original validated XML ships alongside the app.
- [ ] Verify the mixed-fixture build, report contents, exclusion behavior, and zero-verified-decision failure through the public build command in Vitest and offline Playwright checks.
