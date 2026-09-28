---
description: "Actionable implementation tasks for the audit result sub-screen"
---

# Tasks: Sous-écran dédié au résultat d’audit

**Input**: Design documents from `specs/002-audit-result-subscreen/`

**Prerequisites**: `plan.md` and `spec.md`; also `research.md`, `data-model.md`,
`contracts/result-screen.md` and `quickstart.md`.

**Tests**: Required by the feature scenarios and the project constitution. Write the
regression tests before the corresponding implementation tasks.

**Organization**: The specification defines one P1 user story. Shared session-contract
prerequisites are in Phase 2; all user-visible behavior is grouped under US1.

## Phase 1: Setup

**Purpose**: Project initialization and shared tooling.

No setup task is required: `package.json` already provides the TypeScript, React, Fastify,
Vitest and Playwright toolchain specified in `plan.md`; no new dependency is planned.

---

## Phase 2: Foundational — session-expiry contract

**Purpose**: Provide a server-authoritative session deadline before implementing the UI timer.

**Independent Test**: `tests/integration/auth-flow.test.ts`,
`tests/contract/auth.contract.test.ts` and `tests/contract/audits.contract.test.ts` verify the
deadline header, its OpenAPI documentation, and that reading session status does not renew
the server-side idle timeout.

### Tests

- [X] T001 [P] Add integration tests in `tests/integration/auth-flow.test.ts` for an authenticated `GET /api/session` returning an RFC 3339 `X-Session-Expires-At` without renewing the existing expiry, an unauthenticated response omitting the header, and an authorized Device Flow response carrying the header.
- [X] T002 [P] Add OpenAPI response-header assertions in `tests/contract/auth.contract.test.ts` for `GET /api/session` and authorized `POST /api/auth/device/poll`, including the RFC 3339 date-time schema and conditional-presence descriptions.
- [X] T003 [P] Add an authenticated audit-response assertion in `tests/contract/audits.contract.test.ts` that `POST /api/audits` returns `X-Session-Expires-At` while its JSON body remains a valid unchanged `AuditResult`.

### Implementation

- [X] T004 [P] Document the conditional `X-Session-Expires-At` response header for session, authorized Device Flow, and protected-route responses in `specs/001-markdown-spec-audit/contracts/openapi.yaml`; leave request and response JSON schemas unchanged.
- [X] T005 [P] Set `X-Session-Expires-At` from the post-`touch()` session expiry in `src/server/auth/require-auth.ts` for authenticated protected-route responses.
- [X] T006 [P] Make authenticated `GET /api/session` read the current expiry without calling `sessionStore.touch()`, and set the header on authenticated status and authorized Device Flow responses in `src/server/auth/routes.ts`; do not emit it for pending or unauthenticated responses.

**Checkpoint**: Session expiry is server-authoritative, documented, and testable without changing the audit JSON contract.

---

## Phase 3: User Story 1 — Consulter le résultat dans un sous-écran dédié (Priority: P1) 🎯 MVP

**Goal**: After a valid audit, show only a dedicated result screen; preserve and restore the unchanged input/result without another audit, while keeping both screens protected by the authenticated session.

**Independent Test**: With a connected test account, paste or upload a valid Markdown specification and run one audit. Verify that the input screen is absent while the six-pillar result screen is visible; returning and reopening preserves the document and makes no second `/api/audits` request; editing invalidates the old result; copy/download still contain the six-pillar Markdown report without the source document; session expiry or account replacement prevents access to the prior state.

### Tests

- [X] T007 [P] [US1] Extend `tests/unit/audit-components.test.ts` to verify `AuditResultScreen` renders the global score, exactly six canonical pillar rows in order `01`–`06`, each with a 0–100 note, non-empty description and at least one improvement, plus the score legend and existing copy/download actions.
- [X] T008 [P] [US1] Update `tests/e2e/paste-audit.spec.ts` to assert that a valid paste audit switches to the result-only screen, returning and reopening the unchanged result makes no additional `/api/audits` request, editing removes the prior result, an audit failure remains on input, late success/failure responses after logout cannot restore state, and a 401 on explicit logout clears the draft.
- [X] T009 [P] [US1] Update `tests/e2e/file-audit.spec.ts` to verify that an uploaded `.md` audit opens the result-only screen and returning preserves the Markdown content, `source: "file"`, and filename without re-auditing.
- [X] T010 [P] [US1] Update `tests/e2e/report-download.spec.ts` to exercise copy and download from the result screen, assert the clipboard text equals the downloaded Markdown, and verify the report has six pillars, score and metadata but never includes the source text.
- [X] T011 [P] [US1] Update `tests/e2e/accessibility.spec.ts` to verify focus moves to the active screen heading on each transition and that controls from the inactive screen are absent from the accessible tree.
- [X] T012 [P] [US1] Add `tests/e2e/session-expiry.spec.ts` using a short server-provided deadline and an intercepted second authorized Device Flow response with a different `user.login` to verify deadline locking, synchronous hiding on visibility after expiry, status checks without document content, same-login recovery, different-login clearing (including a late audit response), and logout/reload clearing.

### Implementation

- [X] T013 [P] [US1] Create `src/web/components/AuditResultScreen.tsx` as the dedicated result view using the existing `AuditResultTable`, `ScoreLegend`, and `ResultActions`; provide a focusable main heading and the `.audit-result-screen` container.
- [X] T014 [P] [US1] Extend `src/web/api.ts` with a session-expiry handler that reads `X-Session-Expires-At` from responses, validates the RFC 3339 timestamp, and notifies `App`; preserve existing 401 behavior and surface malformed header values rather than silently ignoring them.
- [X] T015 [P] [US1] Extend `AuditPageState` and conditional rendering in `src/web/components/AuditPage.tsx` with `screen: "input" | "result"`; preserve `content` as Markdown limited to 204,800 UTF-8 bytes, `source: "paste" | "file"`, `fileName: string | null` (`null` for pasted text), `status: "idle" | "running" | "done" | "error"`, `result: AuditResult | null` associated with the unchanged document, and `error: string | null`; switch to result only after `AuditResultSchema` validates success, show only one screen, keep failures on input, invalidate the result on text/file changes, and make back/reopen navigation issue no audit request.
- [X] T016 [P] [US1] Update `src/web/App.tsx` to retain `auditOwnerLogin: string | null` and `sessionExpiresAt: string RFC 3339 | null` only in memory; use the API expiry handler to lock at the server deadline, check `GET /api/session` at intervals no longer than 60 seconds and on visibility changes, hide synchronously if the stored deadline has passed, hide on `authenticated: false` or 401, resume only for the same login, clear the audit state on a different login, explicit logout or reload, and clean up timers/listeners.
- [X] T017 [P] [US1] Add responsive styling for `.audit-result-screen`, its navigation and focus states in `src/web/styles.css`, reusing the existing table and action styles.

**Checkpoint**: US1 is independently usable and testable; navigation does not submit another audit, and expiry/account changes cannot expose the prior document or result.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Validate the integrated feature and preserve the privacy and accessibility guarantees.

- [X] T018 Run the complete validation sequence in `specs/002-audit-result-subscreen/quickstart.md` (`npm test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm run build`) and resolve any feature-related failures without adding document telemetry or persistent storage.

**Pilot-only criteria**: SC-005–SC-008 are evaluated manually outside the application using
the procedure in `specs/002-audit-result-subscreen/spec.md`; pilot execution requires
representative users and baseline/pilot data. Do not add telemetry or retain document content
to automate these measurements.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code or dependency changes required.
- **Foundational (Phase 2)**: Complete session-header tests and contract updates before implementing server behavior; this phase blocks the result-screen session timer.
- **User Story 1 (Phase 3)**: Depends on all Phase 2 tasks; the user story is the P1 MVP and the only story in this feature.
- **Polish (Phase 4)**: Depends on completion of US1.

### Task Dependencies

- T001, T002 and T003 are independent regression/contract tests and can be authored in parallel.
- T004 depends on T002; T005 depends on T001 and T003; T006 depends on T001. T004–T006 touch separate files and can proceed in parallel after their listed tests are in place.
- T007–T012 are independent tests in separate files and can be authored in parallel after Phase 2.
- T013, T014 and T017 touch separate files and can be implemented in parallel. T015 depends on T013; T016 depends on T014. T015 and T016 can then proceed in parallel.
- T018 runs after every required implementation and regression test is complete.

### Parallel Opportunities

- **Phase 2**: Run T001–T003 together; then parallelize T004, T005 and T006 as their prerequisites permit.
- **US1 test work**: T007–T012 can be split across separate files.
- **US1 implementation**: Start T013, T014 and T017 in parallel; follow with T015 and T016 in parallel once their respective dependencies are ready.

## Parallel Example: User Story 1

1. In parallel, implement the result component (`T013`), API expiry notification (`T014`) and styles (`T017`).
2. In parallel, integrate conditional input/result rendering (`T015`) and session-bound state/expiry handling (`T016`) after their respective dependencies.
3. Run the focused user-story tests (`T007`–`T012`), then the complete quickstart validation (`T018`).

## Implementation Strategy

### MVP First

The MVP is the complete P1 User Story 1: establish the session deadline contract, then implement and validate the dedicated result screen, no-re-audit navigation, input invalidation, export, accessibility and account-bound session recovery. There are no lower-priority stories in this feature.

### Incremental Delivery

1. Complete Phase 2 so the client receives a server-authoritative expiry without renewing the session during status checks.
2. Complete US1 and its focused tests; verify the story independently using the criteria above.
3. Run the full quickstart sequence before considering the feature ready.
