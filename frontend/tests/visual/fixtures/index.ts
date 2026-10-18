import { companyRoutes } from './company'
import { crmRoutes } from './crm'
import { deliveryRoutes } from './delivery'
import { landingRoutes } from './landing'
import { marketingRoutes } from './marketing'
import { omnichannelRoutes } from './omnichannel'
import { operationsRoutes } from './operations'
import { authRoutes, platformRoutes } from './platform'
import { queryRoutes } from './query'
import type { MockRoute } from './types'

/**
 * Ordem importa: a primeira rota que casar responde.
 * Para adicionar fixtures de uma tela, crie um arquivo exportando `MockRoute[]` (e, se usar os
 * "data clients", registre linhas com `registerTable`) e inclua aqui.
 */
export function allRoutes(authenticated: boolean): MockRoute[] {
  return [
    ...authRoutes(authenticated),
    ...platformRoutes,
    ...crmRoutes,
    ...deliveryRoutes,
    ...marketingRoutes,
    ...landingRoutes,
    ...companyRoutes,
    ...omnichannelRoutes,
    ...operationsRoutes,
    ...queryRoutes,
  ]
}
