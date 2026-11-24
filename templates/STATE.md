# 2c8 IMS work state

> Copy to `{{WORK_DIR}}/STATE.md` at phase 0.  
> **Do not mark a phase `complete` without filling its Evidence block.**  
> Update after every lasting write (models, docs, roots, breakdowns) — not only when an area closes.

## Parameters

| Key | Value | Confirmed by user |
|---|---|---|
| Target repository name | | no / yes (date) |
| `repositoryId` | | |
| Primary language (+ id) | | |
| Secondary language (+ id) | | |
| Pilot area | | |
| `STOP_AFTER_PILOT` | | |
| Write scope | only target repo; `get_write_scope` locked | |
| Document root key / value / UUID | | |
| 2c8 UI root matching | pending / done | |

## Gate evidence (binding)

A phase is **complete** only when its Evidence rows are filled. Do not start the next phase otherwise.

### G0 — Preparation

| Evidence | Value |
|---|---|
| Status | incomplete / complete |
| Parameters confirmed (user) | |
| `list_repositories` checked | |
| Methodology topics read | |
| Extract path + file count | |

### G1 — Analysis (pilot minimum if STOP_AFTER_PILOT)

| Evidence | Value |
|---|---|
| Status | incomplete / complete |
| Process cards present | list IDs |
| `CATALOG.md` | ok / missing |
| `SOURCE-MAP.md` skeleton | ok / missing |
| Proposed document root in CATALOG/STATE | |
| Open GAPS that block structure | none / list |

### G2 — Repo + document smoke

| Evidence | Value |
|---|---|
| Status | incomplete / complete |
| `repositoryId` | |
| Language IDs | |
| Document root key | |
| Smoke: `link_document` target | path + languages |
| `verify_document_links` (all langs) | allPass / fail (paste summary) |
| **Forbidden deferral** | Do **not** skip smoke “until pilot model exists”. Minimal path: root + types + link to a known `SOURCE_DIR` file (dummy symbol OK) → verify. |

### G3 — Pilot client gate

| Evidence | Value |
|---|---|
| Status | incomplete / complete / waiting_client |
| Pilot model IDs | |
| `review_process_model` with detailModelIds (overview) | |
| Source-fidelity checklist done | yes / no (see Quality) |
| Client OK (user) | |

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 | | |
| 1 | | |
| 1b | | |
| 2 | | |
| 3 | | |
| 4+ | | |

Allowed status values: `not_started` | `in_progress` | `complete` | `blocked`.  
`complete` requires the matching Gate evidence block above.

## Models

| ID / title | Level | modelId | Status | Notes |
|---|---|---|---|---|
| | L0/L1/L2 | | ok / needs_fix / ZZ_UTGÅR | |

Status rules: prefer **repair** over a second model with the same title. If `ZZ_UTGÅR`, keep both IDs here.

## Handoff BO UUIDs

| Canonical title | symbolId | Producer model | Consumer model |
|---|---|---|---|

## Last verify_* results

| Check | When | Result |
|---|---|---|
| `verify_document_links` | | |
| `verify_handoffs` | | |
| `list_untranslated_symbols` | | |
| `review_process_model` | | |

## Assumptions / open gaps

- (pointer into `GAPS.md`)

## Incident log

Record **including failed** out-of-scope or denied write attempts.

| When | What | Repo / tool | Outcome |
|---|---|---|---|
| | | | |

## Lessons

-
