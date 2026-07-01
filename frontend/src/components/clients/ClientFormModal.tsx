import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Building2, User, Mail, Phone, Globe, MapPin, DollarSign, KeyRound, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { backendDataService } from '@/services/backendDataService';
import { 
  Client, 
  CLIENT_SIZES, 
  CLIENT_SECTORS, 
  LEAD_SOURCES,
  COMMUNICATION_PREFERENCES
} from '@/types/client';

// Schema de validação
const clientSchema = z.object({
  companyName: z.string().min(2, 'Nome da empresa deve ter pelo menos 2 caracteres'),
  contactName: z.string().min(2, 'Nome do contato deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  website: z.string().url('URL inválida').optional().or(z.literal('')),
  sector: z.string().min(1, 'Setor é obrigatório'),
  size: z.enum(['small', 'medium', 'large'], {
    errorMap: () => ({ message: 'Tamanho da empresa é obrigatório' })
  }),
  leadSource: z.string().min(1, 'Fonte do lead é obrigatória'),
  acquisitionCost: z.number().min(0, 'Custo deve ser positivo').optional(),
  // Endereço (opcional)
  address: z.object({
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().default('Brasil')
  }).optional(),
  // Novos campos
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
  communicationPreferences: z.array(z.enum(['email','phone','whatsapp','slack','other'])).optional(),
  // Campos de entrada livres convertidos em array no submit
  tagsInput: z.string().optional(),
  preferredTechnologiesInput: z.string().optional()
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  client?: Client | null;
}

export function ClientFormModal({ isOpen, onClose, onSuccess, client }: ClientFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [sendingAccessEmail, setSendingAccessEmail] = useState(false);
  const [showAddressFields, setShowAddressFields] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      size: 'small',
      address: {
        country: 'Brasil'
      },
      notes: '',
      communicationPreferences: [],
      tagsInput: '',
      preferredTechnologiesInput: ''
    }
  });

  // Preencher formulário quando editando
  useEffect(() => {
    if (client && isOpen) {
      reset({
        companyName: client.companyName,
        contactName: client.contactName,
        email: client.email,
        phone: client.phone || '',
        website: client.website || '',
        sector: client.sector,
        size: client.size,
        leadSource: client.leadSource,
        acquisitionCost: client.acquisitionCost,
        address: client.address || {
          street: '',
          number: '',
          complement: '',
          neighborhood: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'Brasil'
        },
        notes: client.notes || '',
        assignedTo: client.assignedTo || undefined,
        communicationPreferences: Array.isArray((client as any).communicationPreferences) 
          ? (client as any).communicationPreferences 
          : ((client as any).communicationPreference ? [(client as any).communicationPreference] : []),
        tagsInput: Array.isArray(client.tags) ? client.tags.join(', ') : '',
        preferredTechnologiesInput: Array.isArray(client.preferredTechnologies) ? client.preferredTechnologies.join(', ') : ''
      });
      
      if (client.address) {
        setShowAddressFields(true);
      }
    } else if (isOpen) {
      reset({
        size: 'small',
        address: {
          country: 'Brasil'
        },
        notes: '',
        communicationPreferences: [],
        tagsInput: '',
        preferredTechnologiesInput: ''
      });
      setShowAddressFields(false);
    }
  }, [client, isOpen, reset]);

  // Carregar usuários para o select de responsável
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await backendDataService.getUsers({ limit: 200 });
        if (res && (res as any).success) {
          setUsers(((res as any).data || []) as Array<{ id: string; name: string; email: string }>);
        }
      } catch (e) {
        console.error('Erro ao carregar usuários:', e);
      }
    };
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const onSubmit = async (data: ClientFormValues) => {
    try {
      setLoading(true);
      
      // Limpar campos vazios do endereço
      if (data.address) {
        const hasAddressData = Object.values(data.address).some(value => value && (typeof value === 'string' ? value.trim() !== '' : true));
        if (!hasAddressData) {
          data.address = undefined;
        }
      }

      // Converter acquisitionCost para number ou undefined
      if ((data as any).acquisitionCost === '') {
        (data as any).acquisitionCost = undefined as any;
      } else if (typeof (data as any).acquisitionCost === 'string') {
        const n = parseFloat((data as any).acquisitionCost);
        (data as any).acquisitionCost = isNaN(n) ? undefined : (n as any);
      }

      // Normalizar website vazio
      if (data.website === '') {
        data.website = undefined as any;
      }

      // Normalizar assignedTo vazio (evitar erro em coluna UUID)
      if ((data as any).assignedTo === '') {
        (data as any).assignedTo = undefined;
      }

      // Normalizar phone vazio
      if ((data as any).phone === '') {
        (data as any).phone = undefined;
      }

      // Converter strings CSV para arrays
      const parseCsv = (v?: string) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined);
      const payload: any = {
        ...data,
        tags: parseCsv((data as any).tagsInput),
        preferredTechnologies: parseCsv((data as any).preferredTechnologiesInput),
        communicationPreferences: (data.communicationPreferences && data.communicationPreferences.length > 0) ? data.communicationPreferences : ['whatsapp']
      };
      delete payload.tagsInput;
      delete payload.preferredTechnologiesInput;
      delete (payload as any).communicationPreference;

      // Sanitização final de payload
      if (payload.assignedTo === '') delete payload.assignedTo;
      if (payload.acquisitionCost === '' || Number.isNaN(payload.acquisitionCost)) delete payload.acquisitionCost;

      // Log temporário para depuração (remover após validar)
      console.debug('[ClientFormModal] Enviando payload de cliente:', payload);

      let response;
      if (client) {
        response = await backendDataService.updateClient(client.id, payload);
      } else {
        response = await backendDataService.createClient(payload);
      }

      if (response.success) {
        if (!client && response.invitation) {
          if (response.invitation.emailSent) {
            toast.success('Cliente criado e convite enviado com sucesso!');
          } else {
            toast.error('Cliente criado, mas o convite nao foi enviado. Verifique a configuracao SMTP2GO.');
            console.warn('[ClientFormModal] Convite pendente:', response.invitation);
          }
        } else {
          toast.success(client ? 'Cliente atualizado com sucesso!' : 'Cliente criado com sucesso!');
        }
        onSuccess();
        onClose();
      } else {
        const errMsg = typeof response.error === 'string' ? response.error : (response.error?.message || 'Erro ao salvar cliente');
        toast.error(errMsg);
        console.error('[ClientFormModal] Falha ao salvar cliente:', response.error);
      }
    } catch (error) {
      toast.error('Erro ao salvar cliente');
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendAccessEmail = async () => {
    if (!client) return;

    try {
      setSendingAccessEmail(true);
      const response = await backendDataService.sendClientAccessEmail(client.id);

      if (response.success && response.invitation?.emailSent) {
        toast.success(
          response.invitation.action === 'password_reset'
            ? 'E-mail de redefinicao de senha enviado.'
            : 'Novo convite enviado para o cliente.',
        );
        onSuccess();
        return;
      }

      toast.error('O e-mail de acesso nao foi enviado. Verifique a configuracao SMTP2GO.');
      console.warn('[ClientFormModal] E-mail de acesso pendente:', response.invitation || response);
    } catch (error) {
      toast.error('Erro ao enviar e-mail de acesso');
      console.error('Erro ao enviar e-mail de acesso:', error);
    } finally {
      setSendingAccessEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-4 p-6 border-b sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {client ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {client && (
              <button
                type="button"
                onClick={handleSendAccessEmail}
                disabled={sendingAccessEmail}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-yux-200 bg-yux-50 px-3 py-2 text-sm font-medium text-yux-700 hover:bg-yux-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingAccessEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                )}
                {client.portalHasLoggedIn ? 'Enviar redefinicao de senha' : 'Enviar novo convite'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Informações Básicas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="inline h-4 w-4 mr-1" />
                Nome da Empresa *
              </label>
              <input
                {...register('companyName')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="Nome da empresa"
              />
              {errors.companyName && (
                <p className="mt-1 text-sm text-red-600">{errors.companyName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="inline h-4 w-4 mr-1" />
                Nome do Contato *
              </label>
              <input
                {...register('contactName')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="Nome do contato principal"
              />
              {errors.contactName && (
                <p className="mt-1 text-sm text-red-600">{errors.contactName.message}</p>
              )}
            </div>
          </div>

          {/* Contato */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="inline h-4 w-4 mr-1" />
                Email *
              </label>
              <input
                {...register('email')}
                type="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="email@empresa.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="inline h-4 w-4 mr-1" />
                Telefone
              </label>
              <input
                {...register('phone')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Globe className="inline h-4 w-4 mr-1" />
              Website
            </label>
            <input
              {...register('website')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              placeholder="https://www.empresa.com"
            />
            {errors.website && (
              <p className="mt-1 text-sm text-red-600">{errors.website.message}</p>
            )}
          </div>

          {/* Informações da Empresa */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Setor *
              </label>
              <select
                {...register('sector')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              >
                <option value="">Selecione um setor</option>
                {CLIENT_SECTORS.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
              {errors.sector && (
                <p className="mt-1 text-sm text-red-600">{errors.sector.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tamanho *
              </label>
              <select
                {...register('size')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              >
                {CLIENT_SIZES.map(size => (
                  <option key={size.value} value={size.value}>{size.label}</option>
                ))}
              </select>
              {errors.size && (
                <p className="mt-1 text-sm text-red-600">{errors.size.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fonte do Lead *
              </label>
              <select
                {...register('leadSource')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              >
                <option value="">Selecione uma fonte</option>
                {LEAD_SOURCES.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
              {errors.leadSource && (
                <p className="mt-1 text-sm text-red-600">{errors.leadSource.message}</p>
              )}
            </div>
          </div>

          {/* Custo de Aquisição */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="inline h-4 w-4 mr-1" />
                Custo de Aquisição (R$)
              </label>
              <input
                {...register('acquisitionCost', { valueAsNumber: true })}
                type="number"
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="0.00"
              />
              {errors.acquisitionCost && (
                <p className="mt-1 text-sm text-red-600">{errors.acquisitionCost.message}</p>
              )}
            </div>
          </div>

          {/* Preferências & Notas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Responsável
              </label>
              <select
                {...register('assignedTo')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              >
                <option value="">Não atribuído</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preferências de Comunicação
              </label>
              <select
                multiple
                value={watch('communicationPreferences') || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map(o => o.value);
                  setValue('communicationPreferences' as any, values, { shouldValidate: true, shouldDirty: true });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500 min-h-[120px]"
              >
                {COMMUNICATION_PREFERENCES.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tecnologias Preferidas (separadas por vírgula)
              </label>
              <input
                {...register('preferredTechnologiesInput')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="React, Node.js, PostgreSQL"
              />
              <p className="mt-1 text-xs text-gray-500">Ex.: React, Node.js, PostgreSQL</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags (separadas por vírgula)
              </label>
              <input
                {...register('tagsInput')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="SaaS, Enterprise, Prioridade A"
              />
              <p className="mt-1 text-xs text-gray-500">Ex.: SaaS, Enterprise, Prioridade A</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas
              </label>
              <textarea
                {...register('notes')}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="Observações gerais sobre o cliente, preferências adicionais, histórico, etc."
              />
            </div>
          </div>

          {/* Endereço (opcional) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-gray-700">
                <MapPin className="inline h-4 w-4 mr-1" />
                Endereço
              </label>
              <button
                type="button"
                onClick={() => setShowAddressFields(!showAddressFields)}
                className="text-sm text-yux-600 hover:text-yux-700"
              >
                {showAddressFields ? 'Ocultar' : 'Adicionar endereço'}
              </button>
            </div>

            {showAddressFields && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rua
                  </label>
                  <input
                    {...register('address.street')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                    placeholder="Nome da rua"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número
                  </label>
                  <input
                    {...register('address.number')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                    placeholder="123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Complemento
                  </label>
                  <input
                    {...register('address.complement')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                    placeholder="Apto, sala, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bairro
                  </label>
                  <input
                    {...register('address.neighborhood')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                    placeholder="Nome do bairro"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cidade
                  </label>
                  <input
                    {...register('address.city')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                    placeholder="Nome da cidade"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <input
                    {...register('address.state')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                    placeholder="SP"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CEP
                  </label>
                  <input
                    {...register('address.zipCode')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                    placeholder="00000-000"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex justify-end space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-yux-600 text-white rounded-md hover:bg-yux-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              <span>{client ? 'Atualizar' : 'Criar'} Cliente</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
