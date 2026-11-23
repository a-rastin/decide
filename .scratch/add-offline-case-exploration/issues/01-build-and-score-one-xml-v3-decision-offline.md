# 01: Build and score one XML v3 Clinical Decision offline

**What to build:** A model author can use the public build command to deliver a research-only offline app for a synthetic categorical Clinical Decision. Changing an observed Case Input changes the exact posterior of the source-selected option through a latent node.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Document the initial v3 XML and verification contract. Build a matching synthetic Source Material, XML, inventory, and independently authored verification cases covering applicable, unmet, and missing results.
- [ ] Validate references, state mappings, acyclicity, complete and unique probability rows, finite in-range normalized probabilities, and documented inference size limits before generation. Invalid models leave existing artifacts untouched, including with replacement requested.
- [ ] Use the same exact evaluator in build-time verification and the offline original-case result. Demonstrate a posterior that requires marginalizing a latent node and cannot be read directly from an action table row. Show the complement as the Do-Not-Consider Score for the source-selected option, not the highest-posterior action or a clinical probability.
- [ ] Ship byte-identical authoritative XML, local assets, and separate coverage and test reports. Existing v1/v2 commands, case inputs, results, and reports continue to work, including the applicable 1% six-week score and v2 threshold behavior.
