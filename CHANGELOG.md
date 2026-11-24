# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `review_process_model`: performer hygiene — `compound-performer-title`, `orphan-performer-vertex`, `role-controls-document`
- **Write scope lock:** `get_write_scope`, `lock_write_repository`, `unlock_write_repository` — runtime allowlist for mutating calls (no new container per repo). Defaults: require lock before write, auto-lock after `create_repository`, unlock via operator confirm phrase. Optional deny lists (`TWO_C8_WRITE_DENY_REPOSITORY_IDS` / `_NAMES`). Client safetynet rejects out-of-scope `repositoryId` on mutating API calls.
- IMS plan hardening after TechSeed haveri: binding gate evidence + `templates/STATE.md`; detail→overview order / repair-not-duplicate; G2 smoke cannot be deferred; source-fidelity checklist §10.4; hard stop rules (×3 errors / user correction) in plan + `SERVER_INSTRUCTIONS`
- `verify_document_links` quality gate (absolute https/file:/// links; flags bare relative paths / missing roots)
- `delete_symbol` and `delete_mt_document` (gated by `TWO_C8_ALLOW_DELETES`, same irreversible pattern as `delete_model`)
- `link_document` `titles` map — write the same absolute URL to every language in one create

### Fixed

- HTTP transport: share one `WriteScope` across requests (was reset every `POST /mcp`, so auto-lock/`lock_write_repository` looked unlocked on the next `get_write_scope`)
- `move_canvas_vertices`: re-route attached edges in the **same** PATCH as the move (was vertex-then-edge → HTTP 400 “Control point end must lie within the to-vertex bounds”); fallback delete→move→recreate if combined patch still fails
- Soft-hyphen insertion for long Swedish compounds: use TeX patterns (`hyphen/sv`) plus suffix/exception rules instead of mid-word cuts (e.g. `leverans¬överlämning`)
- Per-symbol mutex for `link_document` / `unlink_document` symbol panel merges (parallel calls to the same symbolId are queued; different symbols stay concurrent)

### Changed

- Methodology: compound performer titles ("A och B") — prefer two symbols + two RACI edges; keep coordinated "X- och Y…" as one title. Covered in object-types/naming/process-flow/edges, `SERVER_INSTRUCTIONS` §5b, `get_methodology(raci)`, and `checkNaming` for role/position/organisation
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
