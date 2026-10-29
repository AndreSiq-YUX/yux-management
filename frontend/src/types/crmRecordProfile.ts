export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'boolean'
export type CustomFieldValue = string | number | boolean | null
export type CustomFieldValues = Record<string, CustomFieldValue>

export interface CrmRecordType {
  id: string
  crmInstanceId: string
  name: string
  isActive: boolean
}

export interface CrmCustomField {
  id: string
  crmInstanceId: string
  stableKey: string
  label: string
  fieldType: CustomFieldType
  recordTypeId: string | null
  options: string[]
  required: boolean
  orderIndex: number
  isActive: boolean
}

export interface CrmProfileConfiguration {
  recordTypes: CrmRecordType[]
  fields: CrmCustomField[]
  canConfigure: boolean
  maxFieldCount: number
}

export interface LeadProfileInput {
  recordTypeId: string | null
  values: CustomFieldValues
}

export interface LeadProfile extends CrmProfileConfiguration, LeadProfileInput {}

export const customFieldTypeLabels: Record<CustomFieldType, string> = {
  text: 'Texto curto', textarea: 'Texto longo', number: 'Número',
  date: 'Data', select: 'Seleção', boolean: 'Sim ou não',
}

export function applicableProfileFields(fields: CrmCustomField[], recordTypeId: string | null) {
  return fields.filter(field => field.isActive && (!field.recordTypeId || field.recordTypeId === recordTypeId))
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

export function applicableProfileValues(fields: CrmCustomField[], recordTypeId: string | null, values: CustomFieldValues) {
  return Object.fromEntries(applicableProfileFields(fields, recordTypeId)
    .filter(field => Object.prototype.hasOwnProperty.call(values, field.stableKey))
    .map(field => [field.stableKey, values[field.stableKey]])) as CustomFieldValues
}
