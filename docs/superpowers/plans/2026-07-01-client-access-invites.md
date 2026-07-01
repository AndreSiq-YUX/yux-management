# Client Access Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client edit actions to resend an initial portal invitation or send a password reset email, with separate token purposes and email templates.

**Architecture:** The backend owns token creation, login state, SMTP2GO delivery, and action selection. Client creation and resend-invite use `client_invitation`; password reset uses `password_reset`. The existing set-password page remains the single destination for setting the password, while email copy and admin buttons differ by account state.

**Tech Stack:** Fastify, PostgreSQL, SMTP2GO Admin provider configuration, React, Vite, TypeScript.

---

### Task 1: Token Purposes And Login State

**Files:**
- Modify: `backend/src/auth/routes.ts`
- Modify: `backend/src/auth/invitations.ts`
- Modify: `backend/src/modules/workspace/clientAccess.ts`
- Create: `backend/src/db/migrations/0103_client_access_token_purposes.sql`

- [ ] Add `client_invitation` and `password_reset` token purpose support.
- [ ] Update successful login to set `app_users.last_login = NOW()`.
- [ ] Keep `/auth/invitations/set-password` accepting both valid purposes.
- [ ] Ensure new tokens invalidate older unused tokens of the same purpose.

### Task 2: Resend Client Access Endpoint

**Files:**
- Modify: `backend/src/modules/workspace/routes.ts`
- Create: `backend/src/modules/workspace/clientAccessEmails.ts`

- [ ] Add `POST /api/workspace/clients/:id/access-email`.
- [ ] Load linked client user and `last_login`.
- [ ] Send `client_invitation` email when `last_login IS NULL`.
- [ ] Send `password_reset` email when `last_login IS NOT NULL`.
- [ ] Return `{ emailSent, action, emailError, emailErrorMessage }`.

### Task 3: Frontend Client Edit Action

**Files:**
- Modify: `frontend/src/types/client.ts`
- Modify: `frontend/src/services/backendDataService.ts`
- Modify: `frontend/src/components/clients/ClientFormModal.tsx`

- [ ] Surface `portalHasLoggedIn` and `portalLastLogin` on client rows.
- [ ] Add a button on the edit modal: `Enviar novo convite` before first login, `Enviar redefinicao de senha` after first login.
- [ ] Disable the button while sending and show success/error toasts.

### Task 4: Validation

**Commands:**
- `cd backend && npm run type-check`
- `cd backend && npm run build`
- `cd frontend && npm run type-check`
- `cd frontend && npm run build`

**Deployment Migration Command:**

```bash
docker exec -it yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1 node dist/scripts/apply-migrations.js
```
