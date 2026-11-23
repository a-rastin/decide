# Decide XML v3: categorical and numeric networks

Version 3 builds synthetic Clinical Decisions with categorical and numeric
Case Inputs. See the [latent review fixture](../../../fixtures/latent-review/model.xml)
for categorical evidence and the [numeric review fixture](../../../fixtures/numeric-review/model.xml)
for threshold partitions. The [Phase 2 input contract](../2026-11-22-verify-multi-decision-builds/inputs.md)
and the default v1 build remain unchanged.

```sh
npm run build -- fixtures/latent-review/model.xml path/to/output \
  --cases fixtures/latent-review/cases.json \
  --inventory fixtures/latent-review/inventory.json
```

Open the printed `index.html` from disk. **Clear** and **Flagged** give
Do-Not-Consider Scores of 65% and 35% for the same selected option.
**Outside exercise** does not satisfy the source condition; **Unknown** means
the Case Input was not entered. Neither has a score. The [synthetic Source
Material](../../../fixtures/latent-review/source.md) shows how to calculate the
expected results without running Decide.

## XML elements

Use well-formed UTF-8 XML with no namespaces or `DOCTYPE`. Only the attributes
and children below are allowed; required attributes and text are nonblank.
IDs are compared exactly after XML parsing. Comments and formatting whitespace
are allowed; text fields may contain character data or CDATA.

| Element | Attributes | Content |
| --- | --- | --- |
| `decide-model` | `version="3"` | One or more each of `case-input`, `network`, and `route` |
| `case-input` | `id`, `label`, `type="categorical"` | At least two `value` |
| `case-input` | `id`, `label`, `type="numeric"`, `unit` | Zero or one `sampling` |
| `sampling` | `min`, `max` | One or more `sample` |
| `sample` | `value` | Empty |
| `value` | `id`, `label` | Empty |
| `network` | `id` | One or more `node` |
| `node` | `id` | At least two `state`, zero or more `parent`, and one or more `row` |
| `state` | `id`, `label` | Empty |
| `parent` | `node` | Empty |
| `row` | `probabilities`; `when` required for non-roots and forbidden for roots | Empty |
| `route` | `id`, `label` | One or more `clinical-decision` |
| `clinical-decision` | `id`, `title`, `network`, `action-node`, `guidance` | One or more `observe`, one `applicability`, one `research-modeling-convention` |
| `observe` | `input`, `node`; optional `required="true"` or `"false"` (default) | One `map` per categorical value, or one or more `range` for a numeric input |
| `map` | `value`, `state` | Empty |
| `range` | `state`; optional `min`, `max`, `min-inclusive`, `max-inclusive` | Empty |
| `applicability` | None | One predicate (`equals`, `compare`, `all`, or `any`), one `source-condition`, one `citation` |
| `equals` | `input`, `value` | Empty |
| `compare` | `input`, `operator` (`lt`, `lte`, `eq`, `gt`, `gte`), `threshold` | Empty |
| `all`, `any` | None | At least two predicates |
| `source-condition`, `citation`, `research-modeling-convention` | None | Text |

Input, network, route, and decision IDs are unique within their respective
types across the document. Value IDs are unique within an input, node IDs within
a network, and state IDs within a node. State IDs cannot contain whitespace.
Categorical labels follow the [existing display-label rules](../2026-11-21-prove-offline-path/xml-model.md),
including how the built-in missing option is distinguished from a modeled
category labeled `Unknown`.

### Probability tables and limits

- Parents reference distinct nodes in the same network. A node may appear
  before its parents in XML, but cycles are rejected.
- For a root, the single row is the prior. For any other node, `when` is a
  whitespace-separated tuple of state IDs in `parent` declaration order.
  Every possible parent-state tuple must occur exactly once.
- `probabilities` is a whitespace-separated list of weights in `state`
  declaration order. Each weight must be a base-10 literal from 0 to 1,
  inclusive (scientific notation allowed). Weights use finite binary64
  arithmetic; a positive literal that rounds to zero is rejected. Each row
  must sum to 1 within an absolute tolerance of `1e-12`.
- The build rejects a network with more than **4,096 joint assignments**,
  calculated as the product of all node state counts before applying evidence.
  The evaluator enumerates the supported assignments, summing their masses
  without sampling. Unobserved nodes are marginalized.

### Evidence, applicability, and guidance

Each `observe` maps a Case Input to a node in the decision's network. A decision
may bind an input or a node only once, and must not observe its own action node.
Every categorical value or numeric reading maps to exactly one valid state;
several values or ranges may map to the same state. The action node's states represent mutually exclusive
Competing Actions. `guidance` names the source-selected state of that node,
even when a different state has the highest posterior.

`equals` tests the original categorical value ID of an input bound by the
decision, not its network state. `compare` tests the original numeric reading
in the declared unit, not its assigned band. `all` and `any` combine predicates; a known
false operand settles `all` and a known true operand settles `any` even when
another input is missing. An unmet or indeterminate source condition has no
score. When guidance applies, use only the decision's declared evidence to
compute `1 − P(selected action | evidence)`. Missing optional observations
are marginalized. Missing required observations or zero-likelihood evidence
leave the guidance visible but unscored. The result measures modeled support
for excluding that action, not a clinical probability.

### Numeric observations

A numeric Case Input accepts signed base-10 decimals, including scientific
notation, in its declared unit. The app trims surrounding whitespace, treats a
blank as missing, and rejects text such as `NaN`, `Infinity`, or `0.3 points`.
Comparisons use the exact decimal value, so `0.30` equals `3e-1`, but
`0.30000000000000000001` is strictly greater than either.

Each numeric observation partitions the entire accepted decimal domain. Omit
`min` or `max` for an unbounded end. A supplied end is exclusive unless its
`min-inclusive` or `max-inclusive` flag is `true`. Flags are allowed only
with their corresponding bound and may be `true` or `false`. Adjacent ranges
must meet at the same exact decimal, with one side including it and the other
excluding it. A range may cover just one value if both equal ends are inclusive.
The build rejects empty or inverted ranges, gaps, overlaps, and unknown states.

```xml
<observe input="reading" node="reading-band">
  <range max="0.3" state="low" />
  <range min="0.3" max="0.3" min-inclusive="true" max-inclusive="true" state="boundary" />
  <range min="0.3" state="high" />
</observe>
```

These are scoring ranges, not chart sampling intervals.

### Numeric Sensitivity Bars

To vary a numeric Case Input in the tornado chart, list the exact test values
inside a closed `sampling` interval. Bounds and values use the same exact
decimal syntax and unit as case readings. A sample may equal a bound, and both
bounds may be equal. Numerically identical samples (such as `0.30` and `3e-1`)
are duplicates. The app displays the supplied values in declaration order.

```xml
<case-input id="reading" label="Synthetic reading" type="numeric" unit="points">
  <sampling min="0.09" max="0.31">
    <sample value="0.09" />
    <sample value="1e-1" />
    <sample value="0.2" />
    <sample value="0.300" />
    <sample value="0.31" />
  </sampling>
</case-input>
```

In this example, `0.1` is a source threshold and `0.3` is a model threshold.
For every decision that binds the input, include a sample at every in-interval
applicability threshold and scoring range endpoint, plus at least one sample
strictly below and above each threshold where the interval permits. A
threshold at the lower bound needs no sample below it; one at the upper bound
needs none above. The build rejects inconsistent declarations before writing
any output.

The interval does not limit case entry. If `sampling` is omitted, the app
explains why it skipped the input rather than choosing bounds or test values.
Only samples with comparable scores contribute to the plotted range.

## Verification and publication

Both `--cases` and `--inventory` are required. Use the [same JSON version 1
formats as v2](../2026-11-22-verify-multi-decision-builds/inputs.md). Case
`inputs` contains categorical value IDs or unquoted JSON numbers keyed by
bound Case Input ID; omit a key to represent missing evidence. Authored
numeric tokens are compared without rounding to binary floating point.
Each decision needs applicable (with a guidance
state ID and a score from 0 to 1), unmet, and missing cases. Build-time
verification calls the same evaluator as the offline app and compares scores
within `1e-12`. Author the expected outcomes independently of that evaluator.
For each distinct numeric applicability threshold or range endpoint, the
decision also needs passing cases with that input below, exactly at, and above
the threshold.

```sh
npm run build -- fixtures/numeric-review/model.xml path/to/output \
  --cases fixtures/numeric-review/cases.json \
  --inventory fixtures/numeric-review/inventory.json
```

The command ships the original XML byte for byte, local app assets,
`coverage-report.md`, and `test-report.md`. The test report records build-time
case checks, not Playwright runs. A failed decision is excluded, and if none
verify, nothing is published. Malformed models cannot modify previous
artifacts, even with `--replace`. The default rerun writes a new output folder.
