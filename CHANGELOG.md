# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Documentation, prompts, and IMS plan template are English throughout (consultant-oriented)

### Security

- Docker image no longer defaults to `HOST=0.0.0.0`; document unauthenticated HTTP `/mcp` exposure
- Replace tenant-specific host in API gap docs with a generic example URL

## [1.3.1] - 2026-11-22

### Fixed

- threeBand layout negative Y positioning

### Added

- Activity `descriptionGuidance` wired into workflows and tooling
- GitHub Release body with Docker pull notes on version tags

## [1.3.0] - 2026-11-22

### Added

- Description reads and unlink/breakdown helpers
- Orphan symbol listing and richer handoff checks
- Activity satellite helpers; retarget label fixes
- Document roots (`create_document_root`) and linking guidance
- Properties, versions, layers, and threeBand process maps
- CI with Vitest and Biome
- Apache-2.0 license

## [1.2.0] - 2026-11-22

### Added

- User guidance docs, workflows, prompts, and IMS plan template
- GHCR Docker publish workflow (Node 26)

## [1.1.0] - 2026-11-22

### Added

- Methodology-backed writes via `propose_model_from_text` / `apply_model_proposal`
- `resolve_branching_object_type`, process maps, gated `delete_model`
- Process-map I/O locked to detail scopes via `detailModelIds`
- `review_process_model`, title/canvas edits, BO-aware proposal parsing
- Quality gates and documents-on-process rules
- Package/MCP identity rename to modelM8

## [1.0.0] - 2026-11-20

### Added

- Initial curated 2c8 MT API MCP tools (stdio + Streamable HTTP)
- Methodology pack and domain tools for process consume/create

[Unreleased]: https://github.com/janolss/modelM8/compare/v1.3.1...HEAD
[1.3.1]: https://github.com/janolss/modelM8/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/janolss/modelM8/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/janolss/modelM8/releases/tag/v1.2.0
[1.1.0]: https://github.com/janolss/modelM8/releases/tag/v1.2.0
[1.0.0]: https://github.com/janolss/modelM8/releases/tag/v1.2.0
