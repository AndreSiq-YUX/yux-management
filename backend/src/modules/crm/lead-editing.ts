import { z } from 'zod'

export const leadEditableTextColumns = {
  name: 'name',
  company: 'company',
  email: 'email',
  phone: 'phone',
  whatsappPhone: 'whatsapp_phone',
  websiteUrl: 'website_url',
  cnpj: 'cnpj',
  address: 'address',
  city: 'city',
  state: 'state',
} as const
const previous = z.string().max(2048).nullable().optional()
export const leadExpectedValuesSchema = z
  .object({
    name: previous,
    company: previous,
    email: previous,
    phone: previous,
    whatsappPhone: previous,
    websiteUrl: previous,
    cnpj: previous,
    address: previous,
    city: previous,
    state: previous,
  })
  .strict()
