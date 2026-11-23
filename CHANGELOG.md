# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `verify_document_links` quality gate (absolute https/file:/// links; flags bare relative paths / missing roots)
- `delete_symbol` and `delete_mt_document` (gated by `TWO_C8_ALLOW_DELETES`, same irreversible pattern as `delete_model`)
- `link_document` `titles` map — write the same absolute URL to every language in one create

### Fixed

- Soft-hyphen insertion for long Swedish compounds: use TeX patterns (`hyphen/sv`) plus suffix/exception rules instead of mid-word cuts (e.g. `leverans¬överlämning`)

### Changed

- Documentation, prompts, and IMS plan template are English throughout (consultant-oriented)
- Refresh `docs/dev/API-GAP-ANALYSIS.md` for v1.3.2 tool inventory and knowledge pack counts
- IMS plan / quality docs: empty `DOC_BASE_URL` → use `SOURCE_DIR` as document root; Q3/Q4 require `verify_document_links`
- MT document **content/URL is language-specific** (documented in agent instructions §26c, concepts, quality gates, troubleshooting)
- `verify_document_links`: omit `languageId` → check **all** repo languages (findings include `languageId`); pass `languageId` to scope to one
- `link_document` tool text / notes warn when only one language gets content

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
