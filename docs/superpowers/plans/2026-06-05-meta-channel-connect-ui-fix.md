# Meta Channel Connect UI Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WhatsApp, Instagram Direct and Facebook Messenger connection actions discoverable and make the Meta OAuth/Embedded Signup URL open when a client starts a connection.

**Architecture:** Keep the Supabase Edge Function as the source of connection session state, then let the React service convert its safe public response into a Meta authorization URL. The portal surfaces the connection entry points in the main Omnichannel workspace and the connected-channels page, while the Admin YUX Hub page remains a governance view with clear operational guidance.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Tailwind, Supabase Edge Functions, Meta OAuth and WhatsApp Embedded Signup.

---

### Task 1: Meta Connection URL Contract

**Files:**
- Modify: `frontend/src/services/metaChannelService.ts`
- Test: `frontend/src/services/metaChannelService.test.ts`

- [x] **Step 1: Add tests for the OAuth URL builder**

```ts
expect(buildMetaConnectUrl({
  channel: 'whatsapp',
  state: 'state-1',
  appId: 'app-1',
  graphVersion: 'v20.0',
  embeddedSignupConfigId: 'config-1',
  redirectUri: 'https://hub.yux.com.br/meta/callback',
  expiresAt: '2026-06-05T12:15:00Z',
})).toContain('dialog/oauth')
```

- [x] **Step 2: Implement URL builder and missing-config helper**

```ts
export function getMissingMetaConnectConfig(response: StartMetaChannelConnectResponse) {
  return [
    !response.appId ? 'META_APP_ID' : '',
    !response.redirectUri ? 'META_OAUTH_REDIRECT_URI' : '',
    response.channel === 'whatsapp' && !response.embeddedSignupConfigId ? 'META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID' : '',
  ].filter(Boolean)
}
```

- [x] **Step 3: Make `startConnect` return `authUrl`**

```ts
const data = await requireFunctionData<StartMetaChannelConnectResponse>(...)
return { ...data, authUrl: buildMetaConnectUrl(data), missingConfig: getMissingMetaConnectConfig(data) }
```

### Task 2: Portal Discovery and Onboarding

**Files:**
- Modify: `frontend/src/components/omnichannel/PortalOmnichannelWorkspace.tsx`
- Modify: `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.tsx`
- Modify: `frontend/src/components/omnichannel/ConnectedChannelCard.tsx`
- Modify: `frontend/src/pages/client-portal/PortalConnectedChannelsPage.tsx`
- Test: `frontend/src/components/omnichannel/PortalOmnichannelWorkspace.test.tsx`
- Test: `frontend/src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx`

- [x] **Step 1: Add a visible CTA on the portal Omnichannel page**

```tsx
<Link to="/portal/omnichannel/channels">Conectar canais</Link>
```

- [x] **Step 2: Add connected-channel onboarding text and clearer action labels**

```tsx
<p>Conecte WhatsApp Business, Instagram Direct e paginas do Facebook...</p>
```

- [x] **Step 3: Redirect to Meta when the session is valid**

```ts
const session = await metaChannelService.startConnect(...)
if (session.authUrl) window.location.assign(session.authUrl)
```

### Task 3: Admin Governance Clarity

**Files:**
- Modify: `frontend/src/pages/platform/AdminChannelsPage.tsx`

- [x] **Step 1: Add Admin YUX Hub guidance**

```tsx
<section>As conexoes sao autorizadas pelo cliente no portal...</section>
```

### Task 4: Validation

**Files:**
- Run focused frontend tests.

- [x] **Step 1: Run focused tests**

```bash
npm test -- src/services/metaChannelService.test.ts src/components/omnichannel/ConnectedChannelsWorkspace.test.tsx src/components/omnichannel/PortalOmnichannelWorkspace.test.tsx
```

- [x] **Step 2: Smoke local routes**

```bash
Invoke-WebRequest http://127.0.0.1:5173/portal/omnichannel/channels
Invoke-WebRequest http://127.0.0.1:5173/admin/channels
```
