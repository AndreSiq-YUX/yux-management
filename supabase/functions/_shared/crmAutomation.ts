export type SequenceStep = {
  id: string
  order_index: number
  is_active: boolean
}

export function getNextActiveSequenceStep<T extends SequenceStep>(steps: T[], completedOrderIndex: number) {
  return [...steps]
    .filter(step => step.is_active && step.order_index > completedOrderIndex)
    .sort((left, right) => left.order_index - right.order_index)[0]
}
