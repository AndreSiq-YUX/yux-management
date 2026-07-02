---
name: YUX Hub
description: "Modular CRM & AI Agent Hub — light-first, premium, operational design system for internal ops and client portal."
colors:
  primary: "#0f172a"
  primary-foreground: "#f8fafc"
  background: "#ffffff"
  foreground: "#0a0f1e"
  secondary: "#f1f5f9"
  muted: "#f1f5f9"
  muted-foreground: "#64748b"
  accent: "#f1f5f9"
  destructive: "#ef4444"
  border: "#e2e8f0"
  yux-500: "#0ea5e9"
  yux-600: "#0284c7"
  yux-700: "#0369a1"
  yux-50: "#f0f9ff"
  yux-100: "#e0f2fe"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.01em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: YUX Hub

## 1. Overview

**Creative North Star: "The Intelligent Operations Room"**

A bright, calm, and precise operations room where every client, project, campaign, automation, approval, and metric is visible with clarity. The system feels organized, premium, and trustworthy: dense enough for internal operators to control real business workflows, but clean and executive enough for clients to understand progress, ROI, and next actions at a glance.

This design system explicitly rejects the generic SaaS template aesthetic. It is not a Tailwind admin clone, not an indigo-purple gradient dashboard, not a rounded-everything card grid. The premium feel comes from restraint and precision, not from decorative effects or dark-mode heroics. Light surfaces, confident typography, controlled color, and purposeful spacing carry the brand.

The system serves two modes through one visual language: **internal** (dense, operational, multi-data) and **portal** (executive, simple, confidence-building). The difference is density and exposure, not a different identity.

**Key Characteristics:**

- Light-first with elegant contrast and white/off-white surfaces
- Refined, confident typography using Inter as the workhorse
- Controlled use of the YUX sky-blue accent; rarity is the point
- Flat-by-default elevation; shadows appear only on interaction
- Dual density: one system, two clearly different experiences
- Every state (loading, empty, error) is designed, not an afterthought

## 2. Colors

A restrained palette built on a near-black navy primary, neutral slate grays, and a single sky-blue accent that appears sparingly.

### Primary

- **Deep Navy** (#0f172a): The anchor. Used for primary buttons, active navigation states, and high-emphasis text. Communicates authority and trust. Not a blue that tries to be exciting; a blue that says "we're in control."

### Accent

- **YUX Sky** (#0ea5e9 / #0284c7): The brand signature. Used sparingly for interactive highlights, selected states, data visualization accents, and the YUX logo mark. Maximum 10% of any given screen. Its rarity is what makes it recognizable.

### Neutral

- **Pure White** (#ffffff): Default background. The canvas everything lives on.
- **Off-White** (#f8fafc): Primary foreground text on dark surfaces; subtle page backgrounds when white is too stark.
- **Light Gray** (#f1f5f9): Secondary backgrounds, hover states, muted surfaces. Creates depth without shadows.
- **Border Gray** (#e2e8f0): Dividers, card borders, input borders. The structural grid made visible.
- **Mid Gray** (#64748b): Secondary text, descriptions, timestamps, metadata. Readable but never competing with primary content.
- **Dark Navy-Black** (#0a0f1e): Body text on white. High contrast for readability, not pure black which feels harsh.

### Semantic

- **Destructive Red** (#ef4444): Errors, deletions, critical alerts. Always paired with text or iconography, never color-alone.

### Named Rules

**The 10% Rule.** The YUX Sky accent appears on no more than 10% of any given screen. It is the exclamation point, not the paragraph. If you catch yourself reaching for sky-blue on a third element, stop. The primary navy or a neutral is probably the right answer.

**The No-Gradient Rule.** No gradient backgrounds on buttons, cards, or surfaces. Color is solid and deliberate. Gradients are reserved for data visualization only, and even there, they earn their place.

## 3. Typography

**Font:** Inter (with system-ui, -apple-system, sans-serif fallback stack)

**Character:** A single type family doing all the work. Inter's optical sizing and range of weights handle everything from dense data tables to page headings. The pairing is weight contrast, not family contrast. Semibold headings against regular body create hierarchy without introducing a second font.

### Hierarchy

- **Display** (600, clamp(1.75rem, 4vw, 2.25rem), line-height 1.2, letter-spacing -0.025em): Page-level headings in the dashboard. Used once per view, never repeated. The clamp ensures it scales gracefully without ever shouting.
- **Headline** (600, 1.5rem, line-height 1.3, letter-spacing -0.02em): Section headings within a page. Card titles, panel headers, modal titles.
- **Title** (600, 1.25rem, line-height 1.4): Subsection headings, list item titles, component labels that need emphasis.
- **Body** (400, 0.875rem, line-height 1.5): The workhorse. Table cells, descriptions, form labels, paragraph text. Max line length 65-75ch. The slightly smaller-than-default size (14px) is intentional: it increases information density for the internal ops view without sacrificing readability.
- **Label** (500, 0.75rem, line-height 1, letter-spacing 0.01em): Badges, tags, navigation items, metadata, timestamps. Compact and scannable.

### Named Rules

**The Weight-Only Hierarchy Rule.** All typographic hierarchy is achieved through weight (400/500/600) and size, never through a second font family. Introducing a display serif or decorative font is prohibited unless the brand direction explicitly changes.

**The 14px Body Rule.** Body text is 0.875rem (14px), not 16px. This is deliberate for density in the internal views. The portal (client) views may use 1rem body text for a more spacious, executive feel. The difference is a mode-level decision, not a per-component choice.

## 4. Elevation

Flat-by-default. Surfaces feel clean, precise, and calm at rest. Borders, subtle background tint changes, and spacing are the primary way to separate areas. Shadows are minimal and appear mainly on interaction states: hover, focus, drag, modals, dropdowns, and active overlays.

### Shadow Vocabulary

- **Rest** (none): Cards, panels, and containers at rest carry no shadow. They are defined by their border (#e2e8f0, 1px) and background contrast against the page.
- **Hover** (`0 1px 3px rgba(0, 0, 0, 0.06)`): Subtle lift on interactive cards or rows on hover. Barely visible; felt, not seen.
- **Overlay** (`0 4px 12px rgba(0, 0, 0, 0.08)`): Dropdowns, popovers, and tooltips. The first "real" shadow, reserved for elements that float above the plane.
- **Modal** (`0 8px 24px rgba(0, 0, 0, 0.12)`): Dialogs and modals only. The strongest shadow in the system, and it appears only when something demands full attention.

### Named Rules

**The Flat-By-Default Rule.** If a component is not interacting, floating, or overlaying, it has no shadow. Depth is conveyed through border + background contrast. Shadows are a response to state, not a decorative constant.

**The Three-Tier Ceiling.** The system has exactly three shadow tiers: hover, overlay, modal. No intermediate values. If you need a fourth, the design has a problem that shadows won't fix.

## 5. Components

### Buttons

Refined and restrained. Rectangular with gently curved edges (6px radius). Four variants serve all needs; no variant should feel decorative.

- **Shape:** Gently curved rectangle (6px radius). Not pill-shaped, not sharp.
- **Primary:** Deep Navy (#0f172a) background, white text. 8px 16px padding. Height 40px. The default action button.
- **Hover:** Background opacity shifts to 90%. Transition 150ms ease. No transform, no lift.
- **Focus:** 2px ring offset, ring color matches the primary (#0f172a). Visible but not loud.
- **Secondary:** Light gray (#f1f5f9) background, dark text. For secondary actions that need a button shape.
- **Outline:** White background, border (#e2e8f0). Hover fills to light gray. For tertiary actions.
- **Ghost:** No background, no border. Hover reveals light gray background. For navigation items, toolbar actions, and low-emphasis triggers.
- **Disabled:** 50% opacity, no pointer events. Consistent across all variants.

### Cards

The primary container for grouped content. Defined by borders, not shadows.

- **Corner Style:** 8px radius (lg). Consistent across all card types.
- **Background:** White (#ffffff) on the light gray page background (#f8fafc or #f1f5f9).
- **Shadow Strategy:** None at rest. Hover shadow only on interactive cards.
- **Border:** 1px solid #e2e8f0. This is the card's primary visual boundary.
- **Internal Padding:** 24px (lg) for card content, 24px header with 1.5 spacing units between header elements.

### Inputs / Fields

Clean, border-defined, with a clear focus state.

- **Style:** 1px border (#e2e8f0), white background, 6px radius. Height 40px.
- **Focus:** 2px ring offset, ring color matches primary. Border shifts to the ring color. No glow, no color change beyond the ring.
- **Placeholder:** Muted foreground (#64748b). Never lighter than this; contrast matters.
- **Error:** Border shifts to destructive red (#ef4444). Error message appears below in red text. No icon-only error indication.
- **Disabled:** 50% opacity, not-allowed cursor.

### Navigation

The sidebar is the primary navigation. Fixed left, 256px wide, white background with a bottom border on the logo area.

- **Style:** Vertical list with grouped sections. Group labels in label size (0.75rem, 500 weight, uppercase optional but not default).
- **Default:** Muted foreground text, no background.
- **Hover:** Light gray (#f1f5f9) background, rounded-md. Text shifts to foreground.
- **Active:** Light gray background with a subtle left indicator or bolder text weight. The YUX Sky accent may appear as a 2px left border on the active item only.
- **Mobile:** Collapses to a hamburger-triggered overlay. Not a bottom tab bar; the sidebar is the navigation identity.

### Badges / Tags

Compact status indicators. Pill-shaped, small, always paired with text.

- **Style:** Full radius (pill), 2px 10px padding, text-xs (0.75rem), semibold weight. 1px border for outline variant.
- **Variants:** Default (primary navy fill), secondary (light gray fill), destructive (red fill), outline (border only).
- **Usage:** Status labels, category tags, counts. Never used as the sole indicator of state; always readable text.

## 6. Do's and Don'ts

### Do:

- **Do** use the Deep Navy (#0f172a) as the primary action color. It communicates authority and trust, which is the brand promise.
- **Do** keep YUX Sky (#0ea5e9) to 10% or less of any screen. It is the brand signature; overuse dilutes it.
- **Do** use borders (#e2e8f0, 1px) as the primary way to define card boundaries, section breaks, and input fields. The border is the structure.
- **Do** design every state: loading, empty, error, disabled. A blank table with no empty state is a shipped bug.
- **Do** use Inter at 14px (0.875rem) for body text in internal views. The density is intentional and appropriate for operational use.
- **Do** use 6px radius on buttons and inputs, 8px on cards. The consistency matters more than the exact value.
- **Do** make the client portal feel visibly different in density (not in identity): larger body text (16px), more whitespace, fewer data points per screen.

### Don't:

- **Don't** use gradient backgrounds on buttons, cards, or surfaces. Color is solid and deliberate. The only acceptable gradients are in data visualization.
- **Don't** use the indigo-purple palette or any color that looks like a default Tailwind admin template. The YUX identity is navy + sky, not the training-data default.
- **Don't** add shadows to resting cards. Flat-by-default means flat. Shadows are a response to interaction, not a decorative constant.
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe on cards or list items. This is prohibited.
- **Don't** use glassmorphism, backdrop-blur, or frosted-glass effects as a default treatment. They are reserved for rare, purposeful moments.
- **Don't** put a tiny uppercase tracked eyebrow above every section. One named kicker as a brand system is voice; an eyebrow on every section is AI grammar.
- **Don't** use color alone to indicate status or errors. Always pair with text or iconography for accessibility (WCAG AA).
- **Don't** make the client portal a copy of the internal view with hidden tabs. It should feel executive, simple, and confidence-building from the first glance.
- **Don't** use rounded-full (pill) buttons. Buttons are rectangular with 6px radius. Only badges and tags are pills.
- **Don't** ship a page without testing at 768px and 375px. The viewport is part of the design.
