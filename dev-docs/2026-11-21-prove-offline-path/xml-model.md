# Decide XML schema version 1

Phase 1 models one Clinical Decision and one categorical Case Input. The [six-week follow-up fixture](../../fixtures/six-week-follow-up/model.xml) is a complete example. The build accepts well-formed UTF-8 XML with an unqualified `<decide-model version="1">` root. Omit namespaces and `DOCTYPE` declarations. An XML declaration is optional. If it specifies an encoding, use `UTF-8`.

| Element | Required attributes | Content |
| --- | --- | --- |
| `decide-model` | `version` | One `case-input` and one `clinical-decision` |
| `case-input` | `id`, `label` | Two or more `value` elements |
| `value` | `id`, `label` | Empty |
| `clinical-decision` | `title` | One `applicability` and one `action-distribution` |
| `applicability` | `input`, `value` | One `source-condition` and one `citation` |
| `source-condition`, `citation` | None | Nonblank text |
| `action-distribution` | `guidance` | One `research-modeling-convention` and two or more `action` elements |
| `research-modeling-convention` | None | Nonblank text |
| `action` | `id`, `label`, `probability` | Empty |

Use only the listed attributes and children. Required attributes must be nonblank. Elements may appear in any order within their parent, and `value` order determines display order. Comments and formatting whitespace are allowed. Text fields may contain character data or CDATA.

The `applicability` element's `input` must match the Case Input `id`. Its `value` must match one of that input's value IDs. Value IDs must be unique within the Case Input. The matching value establishes the source condition, and other known values rule it out. The generated app represents unknown as absent evidence.

The `guidance` attribute must match an action ID in the same distribution. Action IDs must be unique within the distribution. IDs and references are compared exactly after XML parsing. Each action probability is a base-10 number between 0 and 1 inclusive. Scientific notation is allowed. Probabilities must sum to 1 within an absolute floating-point tolerance of `1e-12`.

Each `action` represents one of the mutually exclusive Competing Actions available when the source condition holds. The author is responsible for choosing mutually exclusive actions because the build checks their IDs and probabilities, while exclusivity depends on what the actions mean. The Research Modeling Convention documents how the model assigns support.

Build the fixture or pass another model and a destination to the same command.

```sh
npm run build -- fixtures/six-week-follow-up/model.xml path/to/output
```

The build validates the XML before constructing the browser data or writing artifacts. If validation fails, the command exits unsuccessfully and reports the model path and cause on stderr. An existing output directory is left untouched.
