## ADDED Requirements

### Requirement: The server SHALL expose resources and prompts

The server MUST list a project index resource and per-project design, Markdown summary, and explanation resources addressed by project id, and MUST offer prompts for a design session, a design review, and an existing-code explanation.

#### Scenario: Read the Markdown summary

- **WHEN** a client reads `zhusi://projects/{projectId}/summary.md`
- **THEN** it receives the same Markdown as the export command without writing files

### Requirement: The server SHALL support multiple registered projects

`zhusi mcp` MUST accept repeated `--project` options. Tools MUST accept an optional `project` argument that selects one of the registered roots, defaulting to the first, and MUST reject any unregistered path with an input error.

#### Scenario: Unregistered project

- **WHEN** a tool call names a project path that was not registered at startup
- **THEN** the call returns an `INVALID_INPUT` tool error and no data outside registered roots is read or written

### Requirement: The server SHALL expose review tools

The server MUST expose `zhusi_add_reviews` and `zhusi_dispose_reviews` with the same semantics as the CLI review commands.

#### Scenario: Asynchronous second-client review

- **WHEN** a second client reads the design, another client commits first, and the second client submits reviews with the old `expectedRevision`
- **THEN** it receives a revision conflict, and after re-reading it can submit successfully
