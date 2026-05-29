import type { Contract, ContractModule } from '@/types/platform'

function contractDate(value: string, endOfDay = false) {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    )
  }

  const date = new Date(value)

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )
}

export function isContractActive(contract: Contract, now = new Date()) {
  if (contract.status !== 'active') return false

  const startsAt = contractDate(contract.startsAt)
  const endsAt = contract.endsAt ? contractDate(contract.endsAt, true) : null

  return startsAt <= now && (!endsAt || endsAt >= now)
}

export function findActiveContract(contracts: Contract[], now = new Date()) {
  return contracts
    .filter(contract => isContractActive(contract, now))
    .sort((a, b) => contractDate(b.startsAt).getTime() - contractDate(a.startsAt).getTime())[0]
}

export function deriveEnabledModuleKeys(contractModules: ContractModule[]) {
  return contractModules
    .filter(contractModule => contractModule.enabled)
    .map(contractModule => contractModule.moduleKey)
}

export function formatLocalDateOnly(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
