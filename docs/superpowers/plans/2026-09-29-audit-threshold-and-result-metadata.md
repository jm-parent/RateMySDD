# Audit Threshold and Result Metadata Implementation Plan

> **For agentic workers:** Executed inline with `superpowers:executing-plans`. All steps are complete.

**Goal:** Accept a score of 85 or higher to unlock the next audit step, remove the visible score legend, and show the analysis date and model beside the existing six-pillar result table.

**Architecture:** Keep the result JSON and audit engine unchanged. Define one passing-score constant in the workflow module and reuse it for step access, automatic navigation, and progress status. Render the existing result metadata (`auditedAt` and `model`) in place of the legend; retain the six-row evaluation table.

**Tech Stack:** TypeScript, React 19, Vitest, Playwright, Vite.

## Global Constraints

- A global score of exactly 85 passes; 84 does not.
- Do not change individual score bands or their calculation.
- Do not estimate or display credits; the engine supplies no usage measurement.
- Do not change the audit result JSON, API, report, or storage behavior.

---

### Task 1: Align the passing threshold

**Files:**
- Modify: `src/web/audit-workflow.ts`
- Modify: `src/web/components/AuditPage.tsx`
- Modify: `src/web/components/AuditProgressHeader.tsx`
- Test: `tests/unit/audit-workflow.test.ts`
- Test: `tests/unit/audit-components.test.ts`
- Test: `tests/e2e/paste-audit.spec.ts`

- [x] **Step 1: Change the workflow boundary test to 84 and 85**
- [x] **Step 2: Run the focused workflow test and verify the 85 assertion fails**
- [x] **Step 3: Add one shared threshold and use it at all three decision points**
- [x] **Step 4: Update the UI and browser boundary checks**
- [x] **Step 5: Run the focused unit tests**
- [x] **Step 6: Run the progression E2E test**

The workflow test demonstrated 84 remains locked and 85 unlocks. The same shared threshold
now drives manual access, automatic advancement, and the progress header's validated state.

### Task 2: Replace the score legend with analysis metadata

**Files:**
- Modify: `src/web/components/AuditResultTable.tsx`
- Delete: `src/web/components/ScoreLegend.tsx`
- Modify: `src/web/styles.css`
- Modify: `tests/unit/audit-components.test.ts`
- Modify: `specs/002-audit-result-subscreen/spec.md`

- [x] **Step 1: Replace the legend assertions with result metadata assertions**
- [x] **Step 2: Run the focused component test and verify it fails**
- [x] **Step 3: Render date and model where the legend currently appears**
- [x] **Step 4: Update the feature specification**
- [x] **Step 5: Run focused verification**
- [x] **Step 6: Run typecheck and the full unit/contract suite**

The result displays a localized analysis date and the model name, removes the score legend,
and keeps all six pillar rows and report actions. The cost is omitted because the engine does
not expose credit or token usage.

## Final Verification

- `rtk npm test`: 33 test files and 189 tests passed.
- `rtk npm run test:e2e`: all 35 browser tests passed.
- `rtk npm run typecheck`: passed.
- `rtk npm run lint`: passed.
- `rtk npm run build`: passed.
- `rtk git diff --check`: passed.