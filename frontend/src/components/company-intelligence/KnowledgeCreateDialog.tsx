import { useEffect, useState } from 'react'
import { FileUp, Link2, Loader2, PenLine } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import type { CompanyKnowledgeDocument, CompanyKnowledgeDocumentType, CompanyKnowledgeVisibility } from '@/types/companyIntelligence'

interface KnowledgeCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  contractId?: string
  onCreated: (documents: CompanyKnowledgeDocument[]) => void
}

export function KnowledgeCreateDialog({ open, onOpenChange, organizationId, contractId, onCreated }: KnowledgeCreateDialogProps) {
  const [mode, setMode] = useState<'text' | 'url' | 'file'>('text')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [documentType, setDocumentType] = useState<CompanyKnowledgeDocumentType>('other')
  const [visibility, setVisibility] = useState<CompanyKnowledgeVisibility>('both')
  const [saving, setSaving] = useState(false)
  const [uploadLimitMb, setUploadLimitMb] = useState(10)

  useEffect(() => {
    if (open) companyIntelligenceService.getKnowledgeUploadLimit(organizationId).then(setUploadLimitMb).catch(() => undefined)
  }, [open, organizationId])

  const reset = () => { setTitle(''); setBody(''); setSourceUrl(''); setFiles([]); setDocumentType('other'); setVisibility('both'); setMode('text') }
  const baseInput = { contractId, title: title.trim(), documentType, visibility, allowedAgentProfileKeys: [], blockedAgentProfileKeys: [] }

  const submit = async () => {
    if (mode !== 'file' && !title.trim()) return toast.error('Informe um título para o conhecimento.')
    if (mode === 'text' && body.trim().length < 10) return toast.error('Escreva pelo menos 10 caracteres.')
    if (mode === 'url' && !sourceUrl.trim()) return toast.error('Informe a URL que será importada.')
    if (mode === 'file' && files.length === 0) return toast.error('Selecione pelo menos um documento.')
    const oversized = files.find(file => file.size > uploadLimitMb * 1024 * 1024)
    if (oversized) return toast.error(`${oversized.name} ultrapassa o limite de ${uploadLimitMb} MB.`)
    setSaving(true)
    try {
      let created: CompanyKnowledgeDocument[] = []
      if (mode === 'text') created = [await companyIntelligenceService.createKnowledgeText(organizationId, { ...baseInput, body })]
      if (mode === 'url') created = [await companyIntelligenceService.createKnowledgeUrl(organizationId, { ...baseInput, sourceUrl })]
      if (mode === 'file') {
        for (const file of files) {
          created.push(await companyIntelligenceService.uploadKnowledgeFile(organizationId, { ...baseInput, title: files.length === 1 && title.trim() ? title.trim() : file.name }, file))
        }
      }
      onCreated(created)
      toast.success(mode === 'text' ? 'Conteúdo salvo para revisão.' : 'Fonte recebida e enviada para indexação.')
      reset()
      onOpenChange(false)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível adicionar esse conhecimento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar conhecimento</DialogTitle>
          <DialogDescription>O conteúdo fica em revisão e só alimenta agentes externos depois da publicação.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={value => setMode(value as typeof mode)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="text"><PenLine className="mr-2 h-4 w-4" />Escrever</TabsTrigger>
            <TabsTrigger value="url"><Link2 className="mr-2 h-4 w-4" />Importar URL</TabsTrigger>
            <TabsTrigger value="file"><FileUp className="mr-2 h-4 w-4" />Documentos</TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="space-y-4 pt-3">
            <Field label="Título" value={title} onChange={setTitle} placeholder="Estratégia de captação de clientes" />
            <div className="space-y-2"><Label htmlFor="knowledge-body">Conteúdo</Label><Textarea id="knowledge-body" rows={12} value={body} onChange={event => setBody(event.target.value)} placeholder="Cole ou escreva aqui políticas, estratégias, FAQs, produtos e demais informações..." /></div>
          </TabsContent>
          <TabsContent value="url" className="space-y-4 pt-3">
            <Field label="Título" value={title} onChange={setTitle} placeholder="Site institucional YUX" />
            <Field label="URL" type="url" value={sourceUrl} onChange={setSourceUrl} placeholder="https://yux.com.br" />
            <p className="rounded-md bg-blue-50 p-3 text-xs text-blue-800">A página será lida, convertida em texto e separada em trechos pesquisáveis. Revise antes de publicar.</p>
          </TabsContent>
          <TabsContent value="file" className="space-y-4 pt-3">
            <Field label="Título opcional para um único arquivo" value={title} onChange={setTitle} placeholder="Se vazio, será usado o nome do arquivo" />
            <div className="space-y-2"><Label htmlFor="knowledge-files">Arquivos</Label><Input id="knowledge-files" type="file" multiple accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={event => setFiles(Array.from(event.target.files || []))} /><p className="text-xs text-gray-500">PDF, DOCX, TXT ou MD. Limite de {uploadLimitMb} MB por arquivo.</p></div>
            {files.map(file => <div key={`${file.name}-${file.size}`} className="rounded-md border bg-gray-50 px-3 py-2 text-sm"><span className="font-medium">{file.name}</span><span className="ml-2 text-gray-500">{formatBytes(file.size)}</span></div>)}
          </TabsContent>
        </Tabs>
        <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="document-type">Categoria</Label><select id="document-type" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={documentType} onChange={event => setDocumentType(event.target.value as CompanyKnowledgeDocumentType)}>{DOCUMENT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="knowledge-visibility">Uso permitido</Label><select id="knowledge-visibility" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={visibility} onChange={event => setVisibility(event.target.value as CompanyKnowledgeVisibility)}><option value="both">Interno e externo</option><option value="internal">Somente interno</option><option value="external">Agentes externos</option></select></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? 'Processando...' : 'Adicionar à base'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const DOCUMENT_TYPES: Array<{ value: CompanyKnowledgeDocumentType; label: string }> = [
  { value: 'brand', label: 'Marca' }, { value: 'product', label: 'Produto' }, { value: 'service', label: 'Serviço' },
  { value: 'faq', label: 'FAQ' }, { value: 'case', label: 'Caso/Prova' }, { value: 'campaign', label: 'Campanha' },
  { value: 'policy', label: 'Política' }, { value: 'other', label: 'Outro' },
]

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  const id = `knowledge-${label.toLowerCase().replace(/\s+/g, '-')}`
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></div>
}

function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`
}
