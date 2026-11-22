# 04: Safe non-overwriting publication and explicit replacement

**What to build:** A build author can rerun a successful build targeting an occupied destination and get a distinct published folder by default with the actual entry-point path reported, overwrite an existing build only when explicitly requested, and rely on failed reruns (including failed validation, verification, generation, or replacement) to leave existing output untouched byte for byte.

**Blocked by:** 03: Verification gate, mixed fixture, and separate coverage & test reports

**Status:** ready-for-agent

- [ ] Stage the complete build artifact (`index.html`, original validated XML byte for byte, local assets, and both reports) before publishing to the destination.
- [ ] When targeting an occupied destination without an explicit replacement request, publish a successful rerun to a distinct output folder, report the actual entry-point path, and leave all contents of the previous build untouched.
- [ ] Support an explicit replacement option that overwrites an existing destination only when requested and only after staging and verification succeed.
- [ ] Ensure any failed rerun—including invalid XML, zero verified decisions, generation errors, or failed explicit replacement—leaves existing output untouched byte for byte and does not leave a usable-looking partial artifact at the destination.
- [ ] Exercise successful reruns, explicit replacement, and failed reruns through the public build command in Vitest.
