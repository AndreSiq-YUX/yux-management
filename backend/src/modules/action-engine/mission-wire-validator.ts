import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import type { MissionConversationTurnResponseWire, MissionPlanResponseWire } from './generated/mission-wire.js'

type MissionWireSchema = Record<string, unknown> & { $id: string }

const schema = loadMissionWireSchema()
const ajv = new Ajv2020({ allErrors: true, discriminator: true, strict: true })
ajv.addSchema(schema)
const responseValidator = requireResponseValidator()
const conversationResponseValidator = requireConversationResponseValidator()

export function validateMissionPlanResponseWire(value: unknown): MissionPlanResponseWire {
  if (responseValidator(value)) return value as MissionPlanResponseWire
  const error = new Error('mission_wire_response_invalid') as Error & { validationErrors?: ErrorObject[] | null }
  error.validationErrors = responseValidator.errors
  throw error
}

export function getMissionPlanResponseValidator(): ValidateFunction<unknown> {
  return responseValidator
}

export function validateMissionConversationTurnResponseWire(value: unknown): MissionConversationTurnResponseWire {
  if (conversationResponseValidator(value)) return value as MissionConversationTurnResponseWire
  const error = new Error('mission_conversation_wire_response_invalid') as Error & { validationErrors?: ErrorObject[] | null }
  error.validationErrors = conversationResponseValidator.errors
  throw error
}

export function getMissionConversationTurnResponseValidator(): ValidateFunction<unknown> {
  return conversationResponseValidator
}

function loadMissionWireSchema(): MissionWireSchema {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const relativePath = 'contracts/mission-supervisor/v1/mission-wire.schema.json'
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), '..', relativePath),
    resolve(moduleDirectory, '../../../../', relativePath),
    resolve(moduleDirectory, '../../../../../', relativePath),
  ]
  const contractPath = candidates.find((candidate) => existsSync(candidate))
  if (!contractPath) throw new Error('mission_wire_schema_not_found')
  return JSON.parse(readFileSync(contractPath, 'utf8')) as MissionWireSchema
}

function requireResponseValidator(): ValidateFunction<unknown> {
  const validator = ajv.getSchema(`${schema.$id}#/$defs/MissionPlanResponseWire`)
  if (!validator) throw new Error('mission_wire_response_schema_missing')
  return validator
}

function requireConversationResponseValidator(): ValidateFunction<unknown> {
  const validator = ajv.getSchema(`${schema.$id}#/$defs/MissionConversationTurnResponseWire`)
  if (!validator) throw new Error('mission_conversation_wire_response_schema_missing')
  return validator
}
