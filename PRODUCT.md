# Product

## Register

product

## Users

Two primary personas sharing one platform with clearly different density levels:

**Internal ops team (YUX):** Power users managing multiple clients, projects, campaigns, CRM pipeline, automations, approvals, and reports daily. They need dense, operational views with fast access to data, status indicators, and bulk actions. Their context is high-frequency, multi-tab, deadline-driven work.

**Client decision-makers (PMEs):** Business owners or marketing managers using a filtered portal to monitor project progress, approve deliverables, view campaign ROI, check financials, and request support. Their context is low-frequency, executive-level oversight. The portal must build confidence through clarity and transparency, not overwhelm with operational detail.

## Product Purpose

YUX OS is the modular operational platform that runs YUX Solucoes em IA internally and is exposed to clients through a role-based portal. It consolidates CRM, project management, campaign tracking, AI agent orchestration, omnichannel attendance, financials, and reporting into a single system. The platform serves as both the operational brain of the company and its primary technology showcase, demonstrating to prospects the level of automation and sophistication YUX can deliver for their businesses.

Success looks like: the internal team operates faster with fewer context switches, clients feel informed and confident without needing to call for updates, and the platform itself becomes a sales asset when showing prospects what they could have.

## Brand Personality

Professional, trustworthy, precise.

The interface communicates enterprise-grade reliability and technical competence without feeling cold or impersonal. It is confident and refined, never flashy. Every detail, from spacing to microcopy, should reinforce that YUX is in control and the user is in good hands.

Voice: direct, clear, Portuguese (BR). No filler, no playful tone in operational surfaces. Warmth is expressed through helpfulness and anticipation of needs, not through casual language or decorative elements.

## Anti-references

- **Generic SaaS dashboards** (Stripe/Linear clones): the platform must not look like every other admin template. No default Tailwind admin UI feel, no indigo-purple gradient accents, no rounded-everything card grids.
- **Cold enterprise tooling** (Salesforce, SAP): while professional, it should feel modern and refined, not bloated or legacy.
- **Dark-mode-by-default**: the reference direction is light-first. Dark mode exists but is not the hero.

## Design Principles

1. **Operational clarity over decoration.** Information density is a feature. The internal views should surface what matters fast: status, numbers, actions. Visual refinement supports readability, never competes with it.

2. **Dual density, one system.** The same design language serves two modes: dense and operational for the internal team, executive and confidence-building for the client portal. The difference is density and exposure, not a different visual identity.

3. **Premium lightness.** Light backgrounds as default. White and off-white surfaces, subtle borders, controlled shadows, refined typography. The premium feel comes from restraint and precision, not from dark surfaces or heavy effects. Reference the craft of Vercel and Raycast, translated to a light-first direction.

4. **Proprietary presence.** The platform has its own identity. It does not look like a Shadcn template or a Bootstrap admin. The YUX brand is present through considered color use, intentional typography, and consistent spatial rhythm, not through a logo slapped on a sidebar.

5. **Trust by design.** Every interaction should reinforce competence. Loading states, error messages, empty states, and transitions are all designed, not afterthoughts. The user should never doubt whether the system is working.

## Accessibility & Inclusion

- WCAG AA compliance as the baseline.
- Body text contrast >= 4.5:1 against backgrounds. Large text >= 3:1.
- Full keyboard navigation support across all interactive surfaces.
- Semantic HTML and proper ARIA labels for all custom components.
- Reduced motion alternatives for all animations and transitions.
- Color is never the sole indicator of status or meaning; always paired with text or iconography.
