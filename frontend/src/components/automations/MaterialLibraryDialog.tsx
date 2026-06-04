import { FileText, Loader2, Search, Trash2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { automationService } from '@/services/automationService'
import type { OrganizationMaterial } from '@/types/automation'

interface MaterialLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (material: OrganizationMaterial) => void
  organizationId: string
}

export function MaterialLibraryDialog({ open, onOpenChange, onSelect, organizationId }: MaterialLibraryDialogProps) {
  const [materials, setMaterials] = useState<OrganizationMaterial[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadLimitMb, setUploadLimitMb] = useState(10)

  const loadMaterials = async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const list = await automationService.getMaterials(organizationId)
      setMaterials(list)
      const limit = await automationService.getUploadLimit(organizationId)
      setUploadLimitMb(limit)
    } catch (error) {
      console.error('Erro ao carregar materiais:', error)
      toast.error('Não foi possível carregar a biblioteca de materiais')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadMaterials()
    }
  }, [open, organizationId])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const fileSizeMb = file.size / (1024 * 1024)
    if (fileSizeMb > uploadLimitMb) {
      toast.error(`Arquivo muito grande. O limite máximo é de ${uploadLimitMb}MB.`)
      return
    }

    setUploading(true)
    try {
      const material = await automationService.uploadMaterial(organizationId, file)
      toast.success('Arquivo adicionado com sucesso!')
      setMaterials(prev => [...prev, material].sort((a, b) => a.name.localeCompare(b.name)))
    } catch (error) {
      console.error('Erro no upload:', error)
      toast.error('Erro ao enviar arquivo para o storage')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, materialId: string) => {
    e.stopPropagation()
    if (!confirm('Deseja excluir permanentemente este arquivo da biblioteca?')) return

    try {
      await automationService.deleteMaterial(materialId)
      toast.success('Arquivo excluído!')
      setMaterials(prev => prev.filter(m => m.id !== materialId))
    } catch (error) {
      console.error('Erro ao excluir:', error)
      toast.error('Não foi possível excluir o arquivo')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-yux-600" />
            Biblioteca de Materiais
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 my-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar materiais..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <div className="relative">
            <input
              type="file"
              id="material-upload-input"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => document.getElementById('material-upload-input')?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 mb-2">
          Limite de tamanho por arquivo configurado pelo admin: <span className="font-semibold">{uploadLimitMb} MB</span>.
        </p>

        <div className="flex-1 overflow-y-auto min-h-[300px] border rounded bg-slate-50 p-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12 gap-2 text-xs">
              <Loader2 className="h-6 w-6 animate-spin text-yux-600" />
              Buscando biblioteca...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12 gap-1 text-xs text-center">
              <p className="font-semibold text-slate-500">Nenhum arquivo encontrado</p>
              <p>Envie arquivos PDF ou imagens para usar em suas mensagens.</p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filtered.map(material => (
                <div
                  key={material.id}
                  onClick={() => onSelect(material)}
                  className="flex items-start gap-3 rounded border bg-white p-3 hover:border-yux-500 hover:bg-yux-50/20 cursor-pointer group transition-all"
                >
                  <FileText className="h-8 w-8 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-semibold text-slate-900 truncate" title={material.name}>
                      {material.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                      <span>{formatSize(material.byteSize)}</span>
                      <Badge variant="outline" className="px-1 text-[8px] py-0 uppercase">
                        {material.fileType.split('/')[1] || 'DOC'}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-8 w-8 p-0 text-red-500 hover:text-red-700 shrink-0"
                    onClick={e => handleDelete(e, material.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
