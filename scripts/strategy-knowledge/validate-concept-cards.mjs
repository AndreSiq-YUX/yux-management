#!/usr/bin/env node
import { readJson } from './_shared.mjs'

const required = [
  'concept',
  'category',
  'sourceScope',
  'visibility',
  'problemSolved',
  'triggerSignals',
  'diagnosisQuestions',
  'decisionRules',
  'antiPatterns',
  'recommendedActions',
  'allowedAgentProfileKeys',
  'stageTags',
  'retrievalTags',
  'yuxModules',
  'requiresHumanReview',
]

const allowedVisibility = new Set(['internal_only', 'client_safe'])
const allowedSourceScope = new Set(['internal', 'client', 'public', 'system'])

function assertArray(card, key, index, { minItems = 0 } = {}) {
  if (!Array.isArray(card[key])) throw new Error(`card[${index}].${key} must be an array`)
  if (card[key].length < minItems) throw new Error(`card[${index}].${key} must have at least ${minItems} item(s)`)
  for (const value of card[key]) {
    if (typeof value !== 'string') throw new Error(`card[${index}].${key} items must be strings`)
  }
}

function validateCard(card, index) {
  for (const key of required) {
    if (!(key in card)) throw new Error(`card[${index}] missing required field ${key}`)
  }
  for (const key of ['concept', 'category', 'sourceScope', 'visibility']) {
    if (typeof card[key] !== 'string' || !card[key].trim()) throw new Error(`card[${index}].${key} must be a non-empty string`)
  }
  if (!allowedSourceScope.has(card.sourceScope)) throw new Error(`card[${index}].sourceScope is invalid`)
  if (!allowedVisibility.has(card.visibility)) throw new Error(`card[${index}].visibility is invalid`)
  assertArray(card, 'triggerSignals', index)
  assertArray(card, 'diagnosisQuestions', index)
  assertArray(card, 'decisionRules', index)
  assertArray(card, 'antiPatterns', index)
  assertArray(card, 'recommendedActions', index, { minItems: 1 })
  assertArray(card, 'allowedAgentProfileKeys', index, { minItems: 1 })
  assertArray(card, 'stageTags', index)
  assertArray(card, 'retrievalTags', index)
  assertArray(card, 'yuxModules', index)
  if (typeof card.requiresHumanReview !== 'boolean') throw new Error(`card[${index}].requiresHumanReview must be boolean`)
}

async function main() {
  const path = process.argv[2]
  if (!path) throw new Error('Usage: node validate-concept-cards.mjs <cards.json>')
  const cards = await readJson(path)
  if (!Array.isArray(cards)) throw new Error('concept cards file must contain a JSON array')
  cards.forEach(validateCard)
  console.log('valid concept cards')
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
