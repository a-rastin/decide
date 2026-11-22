# Phase 2 implementation plan

Follow [requirements.md](requirements.md) for scope and [validation.md](validation.md) for the exit checks. Each task group should leave a focused regression check.

## 1. Define inputs and author the mixed fixture

- See the [Phase 2 input contract](inputs.md) and its linked mixed fixture. The documented version 2 invocation is planned, not yet implemented.
- Document the multi-decision XML version, the inventory and verification-case inputs, stable identifiers, and how to invoke the public build command with them.
- Author matching synthetic Markdown, XML, inventory, and independently expected case results. Cover multiple routes, distinct and shared inputs, a numeric threshold, an unmodeled decision, and a modeled decision with a deliberate verification mismatch.
- Keep the six-week fixture as a version 1 regression. Ensure unsupported-version tests use a version that remains unsupported after the extension.

## 2. Validate and evaluate multiple decisions

- Validate the authoritative XML and references before generation. Reject invalid threshold definitions, incompatible input references, and invalid action distributions.
- Extend the shared evaluator for categorical and numeric inputs in declared units. Test exact threshold boundaries, known negative and missing values, and score derivation from model data.

## 3. Verify decisions and generate separate reports

- Run the synthetic cases with the shared evaluator. Record results by Clinical Decision and exclude decisions with failed or insufficient verification from the browser model.
- Produce independent coverage and test reports. Derive partial status from what was actually delivered and what remains unresolved or unprocessed. Fail without publishing an app when none verify.

## 4. Publish builds without overwriting previous output

- Stage the app, XML, and reports before publishing. Choose a distinct destination on rerun unless replacement was explicitly requested, and print the path that was actually published.
- Exercise successful reruns, rejected reruns, and explicit replacement through the public command. Check that a failed generation or publication does not damage a previous artifact.

## 5. Route and explain verified guidance offline

- Add topic or scenario selection before case questions in multi-route builds. Prompt only for the selected decision's inputs and reuse values only for shared Case Input references.
- Show partial and research-only notices; render the next step, source condition, citation, relevant missing inputs, and score according to the evaluation result. Do not expose excluded decisions as usable guidance.
- Exercise the mixed build, then relocate it and repeat the offline browser checks. Document the build commands, report meanings, rerun behavior, and verification results before review.
