const prefix = 'yux:draft:'

function storageKey(scope: string) {
  return `${prefix}${scope}`
}

export function readSessionDraft<T>(scope: string): T | null {
  try {
    const value = window.sessionStorage.getItem(storageKey(scope))
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

export function writeSessionDraft(scope: string, value: unknown) {
  try {
    window.sessionStorage.setItem(storageKey(scope), JSON.stringify(value))
  } catch {
    // A full or unavailable session storage must not break editing.
  }
}

export function clearSessionDraft(scope: string) {
  try {
    window.sessionStorage.removeItem(storageKey(scope))
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}
