# Phase 2 input contract

This is the contract for Phase 2. The build supports categorical and numeric
version 2 inputs with `--cases` and optional `--inventory`. Version 1 and its
two positional arguments remain supported unchanged.

For a version 2 model, run
`npm run build -- path/to/model.xml path/to/output --cases path/to/cases.json`.
Every delivered decision must pass independently authored applicable, unmet,
and missing cases; numeric decisions also require cases below, at, and above
the threshold. Failed or insufficiently tested decisions are excluded;
if none pass, no app is published. Such a build may be partial and is not a
substitute for inventory reconciliation. Supply `--inventory` to generate the
separate coverage and test reports and assess source coverage.

## Version 2 XML

Version 2 retains the version 1 XML encoding, parsing, text, probability,
distribution and display-label rules unless specified below. The
[mixed fixture](../../../fixtures/mixed-decisions/model.xml) is an example.
Use only the attributes and children listed here. Required attributes and
text must be nonblank. Children may appear in any order; document order is
display order.

| Element | Required attributes | Content |
| --- | --- | --- |
| `decide-model` | `version="2"` | One or more `case-input` and one or more `route` |
| `case-input` | `id`, `label`, `type` | For `categorical`, two or more `value`; for `numeric`, no children and required `unit` attribute |
| `value` | `id`, `label` | Empty |
| `route` | `id`, `label` | One or more `clinical-decision` |
| `clinical-decision` | `id`, `title` | One `applicability` and one `action-distribution` |
| `applicability` | `input`, and either `value` or `operator` and `threshold` | One `source-condition` and one `citation` |
| `source-condition`, `citation` | None | Nonblank text |
| `action-distribution` | `guidance` | One `research-modeling-convention` and two or more `action` |
| `research-modeling-convention` | None | Nonblank text |
| `action` | `id`, `label`, `probability` | Empty |

IDs are stable, nonblank strings compared exactly after XML parsing. Case
Input IDs, route IDs, and decision IDs are each unique across the model;
value IDs are unique within their input and action IDs within their
distribution. Inventory decision IDs refer to the same decision IDs as XML
and cases; a decision belongs to exactly one route. References must resolve.
Input reuse is by ID, never by label: the two decisions in §1 share
`initial-checklist`, whereas `equipment-checklist` is different despite its
identical label.

For a categorical input, `applicability` requires `value` referencing one of
its values and forbids `operator` and `threshold`. For a numeric input it
requires `operator` and `threshold` and forbids `value`. The operators `lt`,
`lte`, `gt`, and `gte` mean respectively less than, less than or equal,
greater than, and greater than or equal. A threshold is a finite base-10 number
(scientific notation permitted) in the declared unit. Compare finite case
values without rounding across the threshold. Missing values are not zero;
invalid numeric values are not missing or valid results.

## Inventory and verification cases

Both inputs are UTF-8 JSON objects with `version: 1`. The
[inventory](../../../fixtures/mixed-decisions/inventory.json) has a `source`
path relative to the inventory, a `decisions` array, and a `sections` array.
Each decision has a unique `id`, source `section`, and `status`: `modeled`
requires a corresponding XML decision, while `unresolved` has no XML decision
and requires a `reason`. Every XML decision must have a modeled inventory
entry. Each separately identified section has a unique `id`, source `section`,
`status` of `unreadable` or `unprocessed`, and a `reason`; sections are not
counted as decisions.

The [cases](../../../fixtures/mixed-decisions/cases.json) have unique case
`id`s, a modeled `decision` ID, `inputs` keyed by Case Input ID, and an
`expected` object. Categorical values are value IDs; numeric values are JSON
numbers in the declared unit. Omit an input to represent missing evidence.
Each case must use only the referenced decision's inputs and valid values.
Expected `state` is `applicable`, `unmet`, or `missing`. Applicable cases also
require the guidance action ID and `score` as a fraction from 0 to 1; other
states omit both. Compare scores with an absolute tolerance of `1e-12`.
Every modeled decision needs applicable, unmet, and missing cases; numeric
decisions also need cases at, below, and above the threshold. A missing
required case excludes the decision, rather than passing it.

The equipment case `equipment-yes-deliberate-mismatch` intentionally expects
0.2, while the XML's 0.9 action probability yields a 0.1 score. This is a
valid model and valid test input, but a failed verification; do not correct
the expected value. The other modeled decisions should verify. The unresolved
decision has no cases. The unprocessed appendix makes the build partial
independently of the unresolved and failed decisions.

## Public invocation

The positional model and output arguments accept inventory and case options:

```sh
npm run build -- fixtures/mixed-decisions/model.xml path/to/output \
  --inventory fixtures/mixed-decisions/inventory.json \
  --cases fixtures/mixed-decisions/cases.json
```

The paths are resolved from the working directory. The command validates
the inputs before generation, verifies cases with the shared evaluator, and
publishes the original XML and separate coverage and test reports alongside
verified guidance. The test report covers build-time synthetic checks, not
browser checks. A rerun targeting an existing path publishes to a distinct
suffixed folder and prints its actual entry point. Add `--replace` to replace
the requested output only after the new artifact has been staged successfully.
Replacement requires a `.decide-build` marker that matches the core app files.
For an older build without a marker, or a build with changed core files, rerun
without `--replace` or choose a new destination. If another Decide process is
publishing to the same destination, a default rerun chooses a suffix;
`--replace` reports a conflict. Do not publish inside another Decide build.
Hidden directory names ending in `-publish-lock` are reserved for publication.
Avoid changing the destination with other tools during publication. If an
external change blocks rollback, the command reports the previous build's
backup path rather than deleting it.
