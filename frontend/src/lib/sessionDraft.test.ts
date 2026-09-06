import { beforeEach, describe, expect, it } from 'vitest'
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from './sessionDraft'

describe('sessionDraft', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('restores and clears a same-tab draft', () => {
    writeSessionDraft('marketing:contract-1', { title: 'Campanha salva' })
    expect(readSessionDraft('marketing:contract-1')).toEqual({ title: 'Campanha salva' })
    clearSessionDraft('marketing:contract-1')
    expect(readSessionDraft('marketing:contract-1')).toBeNull()
  })
})
