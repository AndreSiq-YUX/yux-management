import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clientConversionService } from '@/services/clientConversionService'
import { crmService } from '@/services/crmService'
import { platformService } from '@/services/platformService'
import type { CrmLead } from '@/types/crm'
import type { BillingCycle, Blueprint, Organization, PackageDefinition } from '@/types/platform'

const today = () => new Date().toISOString().split('T')[0]

const clientSizes = [
  { value: 'small', label: 'Pequena' },
  { value: 'medium', label: 'Media' },
  { value: 'large', label: 'Grande' },
] as const

const billingCycles: BillingCycle[] = ['monthly', 'quarterly', 'yearly', 'one_time']

export function ClientConversionsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [leads, setLeads] = useState<CrmLead[]>([])
  const [sourceOrganizationId, setSourceOrganizationId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [blueprintId, setBlueprintId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [sector, setSector] = useState('')
  const [clientSize, setClientSize] = useState<'small' | 'medium' | 'large'>('small')
  const [leadSource, setLeadSource] = useState('')
  const [contractName, setContractName] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [startsAt, setStartsAt] = useState(today())
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [converting, setConverting] = useState(false)
  const [resultMessage, setResultMessage] = useState('')

  const selectedLead = useMemo(() => leads.find(lead => lead.id === leadId), [leadId, leads])
  const selectedPackage = useMemo(() => packages.find(packageItem => packageItem.id === packageId), [packageId, packages])

  const loadBase = useCallback(async () => {
    setLoading(true)
    setResultMessage('')

    try {
      const [loadedOrganizations, loadedPackages, loadedBlueprints] = await Promise.all([
        platformService.getOrganizations(),
        platformService.getPackages(),
        platformService.getBlueprints(),
      ])
      const clientOrganizations = loadedOrganizations.filter(organization => organization.kind === 'client' && organization.clientId)
      const preferredYux = clientOrganizations.find(organization => (
        organization.slug.toLowerCase().includes('yux') || organization.name.toLowerCase().includes('yux')
      ))

      setOrganizations(clientOrganizations)
      setPackages(loadedPackages)
      setBlueprints(loadedBlueprints)
      setSourceOrganizationId(current => current || preferredYux?.id || clientOrganizations[0]?.id || '')
      setPackageId(current => current || loadedPackages[0]?.id || '')
    } catch (error) {
      console.error('Erro ao carregar conversoes:', error)
      toast.error('Nao foi possivel carregar dados de conversao.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLeads = useCallback(async () => {
    if (!sourceOrganizationId) {
      setLeads([])
      return
    }

    setLoadingLeads(true)
    setLeadId('')
    setResultMessage('')

    try {
      const pipelines = await crmService.getPipelines(sourceOrganizationId)
      const leadGroups = await Promise.all(pipelines.map(pipeline => crmService.getLeads(sourceOrganizationId, pipeline.id)))
      const loadedLeads = leadGroups
        .flat()
        .filter(lead => lead.status !== 'lost')
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      setLeads(loadedLeads)
      setLeadId(loadedLeads[0]?.id || '')
    } catch (error) {
      console.error('Erro ao carregar leads para conversao:', error)
      setLeads([])
      toast.error('Nao foi possivel carregar leads do workspace selecionado.')
    } finally {
      setLoadingLeads(false)
    }
  }, [sourceOrganizationId])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  useEffect(() => {
    if (!selectedLead) return

    const nextCompanyName = selectedLead.company || selectedLead.name
    setCompanyName(nextCompanyName)
    setContactName(selectedLead.name)
    setEmail(selectedLead.email)
    setPhone(selectedLead.phone || '')
    setSector(selectedLead.segment || '')
    setLeadSource(selectedLead.source || 'Cliente YUX')
    setContractValue(selectedLead.value !== undefined ? String(selectedLead.value) : '')
    setContractName(`Contrato ${nextCompanyName}`)
    setNotes(selectedLead.notes || '')
  }, [selectedLead])

  const canConvert = Boolean(
    selectedLead &&
    selectedPackage &&
    sourceOrganizationId &&
    companyName.trim() &&
    contactName.trim() &&
    email.trim() &&
    sector.trim() &&
    contractName.trim()
  ) && !converting

  async function handleConvert() {
    if (!selectedLead || !selectedPackage || !canConvert) return

    const value = contractValue.trim() ? Number(contractValue) : undefined
    setConverting(true)
    setResultMessage('')

    try {
      const result = await clientConversionService.convertLeadToClientContract({
        sourceOrganizationId,
        lead: selectedLead,
        packageItem: selectedPackage,
        blueprintId: blueprintId || undefined,
        client: {
          companyName: companyName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          sector: sector.trim(),
          size: clientSize,
          leadSource: leadSource.trim() || selectedLead.source,
          notes: notes.trim() || undefined,
        },
        contract: {
          name: contractName.trim(),
          status: 'active',
          startsAt,
          value: value !== undefined && Number.isFinite(value) ? value : undefined,
          billingCycle,
          notes: `Conversao originada no workspace ${sourceOrganizationId}.`,
        },
      })

      setResultMessage(`Cliente criado, contrato ${result.contract.name || result.contract.id} ativo e lead marcado como convertido.`)
      toast.success('Lead convertido em cliente e contrato.')
      await loadLeads()
    } catch (error) {
      console.error('Erro ao converter lead:', error)
      toast.error('Erro ao converter lead em cliente.')
    } finally {
      setConverting(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Carregando conversoes...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-yux-700">Clientes & Contratos</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Converter lead em cliente</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Use esta ponte quando um lead do workspace YUX fechar. O sistema cria o cliente administrativo,
            abre a organizacao do portal, cria o contrato, aplica um modelo setorial opcional e preserva a origem comercial.
          </p>
        </div>
        <Button variant="outline" onClick={loadBase}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {resultMessage && (
        <section className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          {resultMessage}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5 rounded-lg border bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Workspace de origem">
              <select value={sourceOrganizationId} onChange={event => setSourceOrganizationId(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
                {organizations.map(organization => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Lead fechado">
              <select value={leadId} onChange={event => setLeadId(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
                {loadingLeads && <option>Carregando leads...</option>}
                {!loadingLeads && leads.length === 0 && <option value="">Nenhum lead encontrado</option>}
                {leads.map(lead => (
                  <option key={lead.id} value={lead.id}>
                    {lead.company || lead.name} - {lead.source} - {lead.status || 'open'}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Empresa cliente">
              <input value={companyName} onChange={event => setCompanyName(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </Field>
            <Field label="Contato principal">
              <input value={contactName} onChange={event => setContactName(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </Field>
            <Field label="Telefone">
              <input value={phone} onChange={event => setPhone(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </Field>
            <Field label="Setor">
              <input value={sector} onChange={event => setSector(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="Clinica, Imobiliaria, Educacao..." />
            </Field>
            <Field label="Porte">
              <select value={clientSize} onChange={event => setClientSize(event.target.value as 'small' | 'medium' | 'large')} className="w-full rounded-md border border-gray-300 px-3 py-2">
                {clientSizes.map(size => <option key={size.value} value={size.value}>{size.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Observacoes comerciais">
            <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </Field>
        </section>

        <aside className="space-y-4 rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Contrato e modelo</h2>

          <Field label="Pacote vendido">
            <select value={packageId} onChange={event => setPackageId(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              {packages.map(packageItem => (
                <option key={packageItem.id} value={packageItem.id}>{packageItem.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Modelo setorial opcional">
            <select value={blueprintId} onChange={event => setBlueprintId(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              <option value="">Nao aplicar agora</option>
              {blueprints.map(blueprint => (
                <option key={blueprint.id} value={blueprint.id}>{blueprint.name} - {blueprint.sector}</option>
              ))}
            </select>
          </Field>

          <Field label="Nome do contrato">
            <input value={contractName} onChange={event => setContractName(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Valor fechado">
              <input type="number" min="0" step="0.01" value={contractValue} onChange={event => setContractValue(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </Field>
            <Field label="Inicio">
              <input type="date" value={startsAt} onChange={event => setStartsAt(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </Field>
          </div>

          <Field label="Ciclo de cobranca">
            <select value={billingCycle} onChange={event => setBillingCycle(event.target.value as BillingCycle)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              {billingCycles.map(cycle => <option key={cycle} value={cycle}>{cycle}</option>)}
            </select>
          </Field>

          <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
            A conversao cria Cliente, Organizacao, Contrato e registra o lead como ganho. Se houver modelo setorial,
            ele tambem habilita modulos e cria a base de CRM do setor.
          </div>

          <Button className="w-full" disabled={!canConvert} onClick={handleConvert}>
            {converting ? 'Convertendo...' : 'Converter em cliente'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </aside>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      {children}
    </label>
  )
}
