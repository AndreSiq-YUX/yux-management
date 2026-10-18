import type { ReactElement } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { usePlatformStore } from '@/stores/platformStore'
import type { PlatformRole } from '@/types/platform'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export function LocationProbe() {
  return <span data-testid="pathname">{useLocation().pathname}</span>
}

export async function renderAt(path: string, node: ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        {node}
        <LocationProbe />
      </MemoryRouter>,
    )
  })
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

export const clientRole: PlatformRole = {
  key: 'client_admin',
  name: 'Administrador da conta',
  scope: 'client',
  permissions: ['platform.manage'],
}

const baseOrganization = {
  id: 'org-1',
  name: 'Clínica Aurora',
  slug: 'aurora',
  kind: 'client' as const,
  clientId: 'client-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

export function seedPlatform(overrides: Record<string, unknown> = {}) {
  usePlatformStore.setState({
    mode: 'portal',
    organization: baseOrganization,
    membership: null,
    role: clientRole,
    enabledModuleKeys: ['crm', 'projects', 'bi_reports', 'marketing_studio', 'finance', 'support'],
    activeContract: null,
    ...overrides,
  })
}

export async function click(el: Element | null) {
  if (!el) throw new Error('elemento não encontrado')
  await act(async () => {
    (el as HTMLElement).click()
  })
}

export async function keydown(el: Element | Document, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

export const byText = (root: ParentNode, selector: string, text: string) =>
  (Array.from(root.querySelectorAll(selector)) as HTMLElement[]).find(el => el.textContent?.trim() === text) ?? null

export const pathname = (root: ParentNode) => root.querySelector('[data-testid="pathname"]')?.textContent
