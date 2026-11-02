import {safeLeadUrl} from '@/lib/crm/contactLinks'
import {
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from 'lucide-react'
import type { CrmLead, CommercialClaim } from '@/types/crm'
export function LeadContactDetails({ lead }: { lead: CrmLead }) {
  const imported = lead.commercialProfile?.contacts ?? []
  const contacts = [
    ...(lead.email && !/@(?:lead|yux)\.local$/i.test(lead.email)
      ? [{ kind: 'email', value: lead.email }]
      : []),
    ...(lead.phone ? [{ kind: 'phone', value: lead.phone }] : []),
    ...(lead.whatsappPhone
      ? [{ kind: 'whatsapp', value: lead.whatsappPhone }]
      : []),
    ...imported.filter((c) => c.association === 'confirmed'),
  ]
  const seen = new Set<string>(),
    unique = contacts.filter((c) => {
      const key = `${c.kind}:${c.value}`.toLowerCase()
      if (!c.value || seen.has(key)) return false
      seen.add(key)
      return true
    })
  const website = safeLeadUrl(
    lead.websiteUrl || lead.commercialProfile?.websiteUrl,
  )
  const location = [
    lead.address,
    [lead.city, lead.state].filter(Boolean).join(' / '),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <section
      className="flex flex-col gap-3"
      aria-label="Contatos e localização"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Contatos e localização
      </h3>
      {unique.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum contato informado.
        </p>
      )}
      {unique.map((c) => {
        const label =
          (
            {
              email: 'E-mail',
              phone: 'Telefone',
              whatsapp: 'WhatsApp',
              social: 'Rede social',
              contact_form: 'Formulário de contato',
              business_person: 'Contato',
            } as Record<string, string>
          )[c.kind || ''] || 'Contato'
        const Icon =
          c.kind === 'email'
            ? Mail
            : c.kind === 'phone'
              ? Phone
              : c.kind === 'whatsapp'
                ? MessageCircle
                : ExternalLink
        const digits = (c.value || '').replace(/\D/g, '')
        const href =
          c.kind === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value || '')
            ? `mailto:${encodeURIComponent(c.value!)}`
            : c.kind === 'phone' && digits
              ? `tel:${digits}`
              : c.kind === 'whatsapp' && digits
                ? `https://wa.me/${digits}`
                : safeLeadUrl(c.value)
        return (
          <div
            key={`${c.kind}:${c.value}`}
            className="flex min-w-0 gap-2 text-sm"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              {href ? (
                <a
                  className="break-all font-medium text-primary underline-offset-4 hover:underline"
                  href={href}
                  {...(href.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  {c.value}
                </a>
              ) : (
                <p className="break-words">{c.value}</p>
              )}
            </div>
          </div>
        )
      })}
      {website && (
        <div className="flex min-w-0 gap-2 text-sm">
          <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Site</p>
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-medium text-primary underline-offset-4 hover:underline"
            >
              {website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          </div>
        </div>
      )}
      {location && (
        <div className="flex gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Endereço</p>
            <p className="break-words">{location}</p>
          </div>
        </div>
      )}
      {lead.cnpj && (
        <p className="text-sm">
          <span className="text-muted-foreground">CNPJ</span>
          <br />
          {lead.cnpj}
        </p>
      )}
    </section>
  )
}
export function LeadResearchDetails({ lead }: { lead: CrmLead }) {
  const facts = lead.commercialProfile
  const claims = (title: string, values: CommercialClaim[] | undefined) =>
    values?.length ? (
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <ul className="flex list-disc flex-col gap-2 pl-4 text-sm">
          {values.map((c, i) => (
            <li key={i}>
              {c.value}
              {safeLeadUrl(c.sourceUrl) && (
                <a
                  href={safeLeadUrl(c.sourceUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-primary underline"
                >
                  Evidência pública
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    ) : null
  return (
    <section
      className="flex flex-col gap-5"
      aria-label="Perfil comercial pesquisado"
    >
      {facts?.legalName && facts.legalName !== lead.name && (
        <p className="text-sm">
          <span className="text-muted-foreground">Razão social: </span>
          {facts.legalName}
        </p>
      )}
      {facts?.profile?.summary?.value ? (
        <p className="text-sm leading-relaxed">{facts.profile.summary.value}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          O perfil comercial pesquisado aparecerá aqui quando estiver
          disponível.
        </p>
      )}
      {claims('Serviços e soluções', facts?.profile?.services)}
      {claims('Segmentos atendidos', facts?.profile?.customerSegments)}
      {claims('Regiões de atuação', facts?.profile?.operatingRegions)}
      {claims('Sinais de porte', facts?.profile?.scaleSignals)}
      {!!facts?.activity?.signals?.length &&
        claims(
          'Sinais públicos de atividade',
          facts.activity.signals.map((s) => ({
            value: s.excerpt,
            sourceUrl: s.sourceUrl,
          })),
        )}
      {!!facts?.reasons?.length && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Observações da pesquisa</h4>
          {facts.reasons.map((reason, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {reason}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
