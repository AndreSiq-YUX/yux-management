import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ShowMoreButton } from '../ShowMore'
import { useShowMore } from '../useShowMore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const items = Array.from({ length: 25 }, (_, index) => `Item ${index + 1}`)

function List({ enabled = true, source = items }: { enabled?: boolean; source?: string[] }) {
  const pager = useShowMore(source, { enabled, resetKey: source })
  return (
    <div>
      <ul>{pager.visibleItems.map(item => <li key={item}>{item}</li>)}</ul>
      {pager.hasMore ? <ShowMoreButton shown={pager.shown} total={pager.total} onClick={pager.showMore} /> : null}
    </div>
  )
}

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function render(ui: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return container
}

const more = () => Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('Mostrar mais'))

describe('useShowMore / ShowMoreButton', () => {
  it('shows 10 items first and releases 10 more per click until the end', () => {
    const container = render(<List />)
    expect(container.querySelectorAll('li')).toHaveLength(10)
    expect(container.textContent).toContain('Mostrando 10 de 25')

    act(() => more()!.click())
    expect(container.querySelectorAll('li')).toHaveLength(20)
    expect(container.textContent).toContain('Mostrar mais 5')

    act(() => more()!.click())
    expect(container.querySelectorAll('li')).toHaveLength(25)
    expect(more()).toBeUndefined()
  })

  it('shows the whole list when disabled (wide screens)', () => {
    const container = render(<List enabled={false} />)
    expect(container.querySelectorAll('li')).toHaveLength(25)
    expect(more()).toBeUndefined()
  })

  it('goes back to the first 10 when the list changes', () => {
    const container = render(<List />)
    act(() => more()!.click())
    expect(container.querySelectorAll('li')).toHaveLength(20)
    act(() => root!.render(<List source={items.slice(0, 22)} />))
    expect(container.querySelectorAll('li')).toHaveLength(10)
  })
})
