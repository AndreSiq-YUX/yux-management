import { usePlatformStore } from '@/stores/platformStore'

/** Quem pode configurar agente, equipes e filas do módulo whatsapp_ai. */
export function useCanConfigureOmnichannel() {
  return usePlatformStore(state =>
    Boolean(state.role?.permissions.includes('omnichannel.configure') || state.role?.permissions.includes('platform.manage')),
  )
}
