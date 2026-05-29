import { describe, expect, it } from 'vitest'
import {
  deriveEnabledModuleKeys,
  findActiveContract,
  isContractActive,
} from '@/lib/platform/contracts'
import type { Contract, ContractModule } from '@/types/platform'

const baseContract: Contract = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  status: 'active',
  startsAt: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('contract rules', () => {
  it('returns true for active contract without endsAt when now is after startsAt', () => {
    expect(isContractActive(baseContract, new Date('2026-01-15T12:00:00.000Z'))).toBe(true)
  })

  it.each(['paused', 'draft', 'cancelled', 'completed'] as const)(
    'returns false for %s contracts',
    status => {
      expect(
        isContractActive(
          {
            ...baseContract,
            status,
          },
          new Date('2026-01-15T12:00:00.000Z'),
        ),
      ).toBe(false)
    },
  )

  it('finds the newest active contract by startsAt', () => {
    const contracts: Contract[] = [
      {
        ...baseContract,
        id: 'older-active',
        startsAt: '2026-01-01',
      },
      {
        ...baseContract,
        id: 'paused-newer',
        status: 'paused',
        startsAt: '2026-03-01',
      },
      {
        ...baseContract,
        id: 'newest-active',
        startsAt: '2026-02-01',
      },
    ]

    expect(findActiveContract(contracts, new Date('2026-03-15T12:00:00.000Z'))?.id).toBe(
      'newest-active',
    )
  })

  it('derives enabled module keys in original order', () => {
    const contractModules: ContractModule[] = [
      { contractId: 'contract-1', moduleKey: 'crm', enabled: true },
      { contractId: 'contract-1', moduleKey: 'finance', enabled: false },
      { contractId: 'contract-1', moduleKey: 'projects', enabled: true },
    ]

    expect(deriveEnabledModuleKeys(contractModules)).toEqual(['crm', 'projects'])
  })
})
