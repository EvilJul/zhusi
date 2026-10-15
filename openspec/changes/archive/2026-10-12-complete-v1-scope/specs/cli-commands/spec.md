## ADDED Requirements

### Requirement: CLI SHALL provide review and disposition commands

`zhusi design review --input` MUST append reviews or opinions, and `zhusi design dispose` MUST accept either `--review/--decision/--reason` or a batch `--input`, with `--expected-revision`, `--request-id`, and `--dry-run`. Decisions accept `accept`, `reject`, and `defer`.

#### Scenario: Unknown decision

- **WHEN** `--decision` is not one of accept, reject, defer
- **THEN** the command exits with code 2 and writes nothing
