# architecture-explanation Specification

## Purpose
为已有代码项目生成分层、可追溯的架构讲解，帮助用户理解入口、模块、调用链和设计偏差，同时明确区分代码证据、AI 推断和未知信息。

## Requirements

### Requirement: explain SHALL capture a code snapshot before saving an explanation

`zhusi explain --existing PATH` MUST record the project root identity, Git commit when available or a deterministic directory fingerprint, tool/source metadata, read scope, generation time, and optional related design revision. It MUST NOT copy the entire source tree into `.zhusi/`.

#### Scenario: Explain a Git project

- **WHEN** the user runs explain for a repository with a current commit
- **THEN** the saved explanation references that commit and the inspected scope

#### Scenario: Explain a non-Git directory

- **WHEN** the target directory is not a Git repository
- **THEN** the CLI records a deterministic directory fingerprint and clearly identifies the absence of Git provenance

### Requirement: Explanations SHALL provide three progressive detail levels

A saved explanation MUST support a concise summary, an end-to-end walkthrough, and a deep dive into modules/symbols. Each material conclusion MUST include evidence references or be explicitly marked unknown/inferred.

#### Scenario: Read summary first

- **WHEN** a client requests the default explanation context
- **THEN** the response returns the concise overview, source snapshot, warnings, and a way to request deeper sections

#### Scenario: Expand a call path

- **WHEN** a client requests a walkthrough section
- **THEN** the response shows the entry point, ordered relevant steps, branches or failure handling, and evidence for each supported step

### Requirement: The system SHALL distinguish facts, inferences, intent, and unknowns

The explanation data and report MUST label code facts, design intent, AI inferences, unknowns, confidence, and limitations separately. Missing runtime or out-of-scope information MUST NOT be presented as confirmed fact.

#### Scenario: Insufficient evidence

- **WHEN** a conclusion is based only on naming or a read scope that omits the relevant implementation
- **THEN** the conclusion is marked inferred or unknown and the limitation is visible

### Requirement: Explanations SHALL become stale when their source changes

The system MUST compare the stored code snapshot with the current target before treating an explanation as current. A changed commit or directory fingerprint MUST mark the explanation stale and surface a re-generation warning.

#### Scenario: Changed Git commit

- **WHEN** the target repository commit differs from the saved snapshot
- **THEN** status and reports mark the explanation stale and do not silently claim it describes the current code

### Requirement: Explanation input SHALL be bounded and untrusted

The CLI MUST bind explanation requests to an allowed project root, enforce read/output limits, treat tool and model text as untrusted content, and never execute shell commands, install dependencies, or modify source code as a side effect.

#### Scenario: Malicious explanation text

- **WHEN** evidence or generated text contains HTML/script payloads
- **THEN** storage remains data-only and report rendering escapes it without executing it
