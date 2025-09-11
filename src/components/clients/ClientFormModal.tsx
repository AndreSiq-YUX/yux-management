import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Building2, User, Mail, Phone, Globe, MapPin, Tag, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '@/services/api';
import { 
  Client, 
  ClientFormData, 
  CLIENT_SIZES, 
  CLIENT_SECTORS, 
  LEAD_SOURCES 
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
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assignedTo: z.string().optional(),
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
  }).optional()
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
  const [showAddressFields, setShowAddressFields] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
    getValues
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      size: 'small',
      tags: [],
      address: {
        country: 'Brasil'
      }
    }
  });

  const watchedTags = watch('tags') || [];

  // Carregar usuários para atribuição
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiService.getUsers({ limit: 100 });
        if (response.success && response.data) {
          setUsers((response.data as any).users || []);
        }
      } catch (error) {
        console.error('Erro ao carregar usuários:', error);
      }
    };

    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

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
        notes: client.notes || '',
        tags: client.tags || [],
        assignedTo: client.assignedTo || '',
        address: client.address || {
          street: '',
          number: '',
          complement: '',
          neighborhood: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'Brasil'
        }
      });
      
      if (client.address) {
        setShowAddressFields(true);
      }
    } else if (isOpen) {
      reset({
        size: 'small',
        tags: [],
        address: {
          country: 'Brasil'
        }
      });
      setShowAddressFields(false);
    }
  }, [client, isOpen, reset]);

  const onSubmit = async (data: ClientFormValues) => {
    try {
      setLoading(true);
      
      // Limpar campos vazios do endereço
      if (data.address) {
        const hasAddressData = Object.values(data.address).some(value => value && value.trim() !== '');
        if (!hasAddressData) {
          data.address = undefined;
        }
      }

      // Converter acquisitionCost para number se for string
      if (data.acquisitionCost && typeof data.acquisitionCost === 'string') {
        data.acquisitionCost = parseFloat(data.acquisitionCost);
      }

      let response;
      if (client) {
        response = await apiService.updateClient(client.id, data);
      } else {
        response = await apiService.createClient(data);
      }

      if (response.success) {
        toast.success(client ? 'Cliente atualizado com sucesso!' : 'Cliente criado com sucesso!');
        onSuccess();
        onClose();
      } else {
        toast.error(response.error?.message || 'Erro ao salvar cliente');
      }
    } catch (error) {
      toast.error('Erro ao salvar cliente');
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !watchedTags.includes(tagInput.trim())) {
      const newTags = [...watchedTags, tagInput.trim()];
      setValue('tags', newTags);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = watchedTags.filter(tag => tag !== tagToRemove);
    setValue('tags', newTags);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center space-x-2">
            <Building2 className="h-5 w-5 text-yux-600" />
            <span>{client ? 'Editar Cliente' : 'Novo Cliente'}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
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
                placeholder="Ex: Empresa ABC Ltda"
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
                placeholder="Ex: João Silva"
              />
              {errors.contactName && (
                <p className="mt-1 text-sm text-red-600">{errors.contactName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="inline h-4 w-4 mr-1" />
                Email *
              </label>
              <input
                {...register('email')}
                type="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="contato@empresa.com"
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Setor *
              </label>
              <select
                {...register('sector')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              >
                <option value="">Selecione o setor</option>
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
                Tamanho da Empresa *
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
                <option value="">Selecione a fonte</option>
                {LEAD_SOURCES.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
              {errors.leadSource && (
                <p className="mt-1 text-sm text-red-600">{errors.leadSource.message}</p>
              )}
            </div>

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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Responsável
              </label>
              <select
                {...register('assignedTo')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              >
                <option value="">Não atribuído</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Tag className="inline h-4 w-4 mr-1" />
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {watchedTags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yux-100 text-yux-800"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-1 text-yux-600 hover:text-yux-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                placeholder="Digite uma tag e pressione Enter"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-4 py-2 bg-yux-600 text-white rounded-md hover:bg-yux-700"
              >
                Adicionar
              </button>
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

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              placeholder="Informações adicionais sobre o cliente..."
            />
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