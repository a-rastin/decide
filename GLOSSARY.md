# Decide

Decide helps AI agents turn medical documents into decision support systems for research with synthetic cases.

## Language

**Source Material**:
Medical documents used to build a decision support system, distinct from values entered when using the generated system.
_Avoid_: Raw medical data

**Case Input**:
A value supplied for a synthetic case when using a generated decision support system.

**Clinical Decision**:
An explicit or implicit choice about what to do next that is addressed by the Source Material. A choice of follow-up timing counts; a background fact does not count on its own.

**Unresolved Decision**:
A discovered Clinical Decision for which Decide cannot produce supported guidance. It still counts toward the coverage inventory.

**Research Modeling Convention**:
A declared assumption that translates wording in the Source Material into numerical support for a guidance option. It is distinct from an empirical probability, such as the probability of a condition or outcome.

**Proxy Estimate**:
An estimate borrowed from evidence that does not directly match the population or setting of a Clinical Decision but is judged informative for that decision.

**Competing Action**:
An alternative outcome of the same Clinical Decision. Unlike actions that can be taken together, competing actions share one probability distribution.

**Do-Not-Consider Score**:
A case-specific score for a guidance option, where a higher value means stronger modeled support for not considering that option. It is distinct from the probability assigned to the option itself.

**Sensitivity Bar**:
The range of comparable Do-Not-Consider Scores for a guidance option when one Case Input varies and the other inputs and model assumptions stay fixed. It describes model sensitivity, not causation; a state in which the guidance does not apply has no comparable score.

**What-If Sandbox**:
A way to compare a synthetic case with a variant that changes only Case Inputs. The original case and model assumptions, including Proxy Estimates and Research Modeling Conventions, stay unchanged.
