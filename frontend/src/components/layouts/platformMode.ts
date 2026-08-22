export function resolvePlatformMode(pathname: string) {
  if (pathname.startsWith('/portal')) return 'portal' as const
  if (/^\/client-workspaces\/[^/]+/.test(pathname)) return 'client_workspace' as const
  return 'internal' as const
}
