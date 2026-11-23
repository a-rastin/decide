# Synthetic Exploration Note

This is a fictional exercise for research with synthetic cases, not clinical guidance.

## §1 — Joint review

Review the synthetic reading when the reading is at least 0.3 points, or
when it is at least 0.1 points and the marker is not Outside exercise.
The marker is required to compute a score for this decision, even when
the reading alone establishes that review applies.

## §2 — Follow-up review

Review the synthetic reading when the follow-up reading is at least 0.1 points. The follow-up reading is a separate input with the same display label. The marker carries over from the first decision but is not needed to determine applicability or compute a score.

## Research Modeling Convention and worked scores

The reading band is low below 0.3 points, boundary at exactly 0.3 points,
and high above it. The marker changes the mix of two unobserved states,
L and R. With marker A they have weights ¾ and ¼; with B, ¼ and ¾.
Outside exercise gives both states equal weight. Impossible has prior
probability zero: observing it leaves no posterior, even if guidance applies.

The Do-Not-Consider Score is the modeled weight on deferring review, the
only competing action. Multiply the two defer weights in each row by the
marker-specific mix and add:

| Reading band | Defer given L | Defer given R | Score with A | Score with B |
| --- | ---: | ---: | ---: | ---: |
| Low | 90% | 50% | 80% | 60% |
| Boundary | 80% | 40% | 70% | 50% |
| High | 40% | 0% | 30% | 10% |

At the joint baseline (0.2 points, A), the reading sweep visits 0.09
(unmet), 0.1 (80%), 0.2 (80%), 0.300 (70%), and 0.31 (30%): a 50-point
span. The marker sweep visits A (80%), B (60%), Outside exercise (unmet),
and Impossible (no posterior): a 20-point span. Editing the reading to
0.31 and the marker to B together gives `¼ × 40% + ¾ × 0% = 10%`,
which is absent from both sweeps and differs from both isolated edits.

For the follow-up with no marker entered, the marker priors are 40% A,
40% B, 20% Outside exercise, and 0% Impossible. In the low band, Outside
exercise would score 70%, so marginalizing the marker gives
`0.4 × 80% + 0.4 × 60% + 0.2 × 70% = 70%`.
