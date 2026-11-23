# Synthetic Review Note

## §1 — Sample review

For this fictional exercise, consider reviewing the synthetic sample if its
screening result is Clear or Flagged. This guidance does not apply to a sample
marked Outside exercise.

### Research Modeling Convention

The latent review pattern is A or B with equal prior weights. The synthetic
screening result is Clear, Flagged, or Outside exercise with probabilities
(0.6, 0.2, 0.2) under A and (0.2, 0.6, 0.2) under B. The competing actions
are to consider reviewing the sample or defer the review decision; support for
review is 0.2 under A and 0.8 under B. These weights are authored for the
exercise, not measured clinical probabilities.

### Verification arithmetic

- **Clear:** the posterior weight of B is `0.2 / (0.6 + 0.2) = 0.25`.
  The selected action posterior is `0.75 × 0.2 + 0.25 × 0.8 = 0.35`.
  Its Do-Not-Consider Score is `0.65`, even though deferral has higher
  posterior support.
- **Flagged:** the posterior weight of B is `0.6 / (0.2 + 0.6) = 0.75`.
  The selected action posterior is `0.25 × 0.2 + 0.75 × 0.8 = 0.65`.
  Its Do-Not-Consider Score is `0.35`.
- **Outside exercise:** the source condition is unmet. No score.
- **Unanswered:** the source condition is indeterminate. No score.
