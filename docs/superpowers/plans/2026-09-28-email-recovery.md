# Email Recovery Implementation Plan

> Execute inline using executing-plans and test-driven-development. User has approved the recovery design and privacy tradeoff; continue without repeating permission requests.

**Goal:** Recover private vault passwords through the signed-in Google email with original data intact.
**Architecture:** Keep current vault format; store a server-encrypted master-key backup in an owner-isolated table; require fresh Supabase OTP verification before release.
**Tech Stack:** Existing Next.js, WebCrypto, Supabase Auth/Postgres, Vitest/PGlite/Playwright.
**Spec:** ../specs/2026-09-28-email-recovery-design.md

## Constraints
No passwords in requests; no secret in public env/build/logs/Git. No client-specified recipient. Preserve CAS, fail-closed identity checks, memory-only decrypted state and all existing data.

## Work
- [x] Write failing tests for password/recovery material export and restoration, escrow authentication and API failure cases.
- [x] Implement browser crypto helpers, server escrow/config/identity validation and OTP endpoints. Verify negative cases.
- [x] Add recovery table with owner RLS, immutable identity and bounded ciphertext; test on PGlite with two users.
- [x] Add Gmail recovery dialog and enrollment step, keep offline backup, update privacy copy. Test desktop/mobile and refresh/conflict behavior.
- [x] Update setup docs, prepare SQL and mail template, generate local secret without printing it. Run full tests, typecheck and build, review changes. Delivery: commit/push to the already-authorized repository.

## Review focus
Unconfigured server must not claim protection; legacy users cannot enroll without unlocking; wrong-account OTP must not release anything; lost response must not overwrite newer data; repeated reset must preserve escrow and original files. Real SMTP delivery remains a manual external acceptance check.
