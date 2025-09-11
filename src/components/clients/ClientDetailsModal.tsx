import { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  User, 
  Mail, 
  Phone, 
  Globe, 
  MapPin, 
  Tag, 
  DollarSign,
  Calendar,
  TrendingUp,
  FileText,
  Edit,
  Trash2,
  Plus
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '@/services/api';
import { Client, ClientProject, ClientInteraction } from '@/types/client';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: (client: Client) => void;
  onDelete: (clientId: string) => void;
  client: Client | null;
}

export function ClientDetailsModal({ 
  isOpen, 
  onClose, 
  onEdit, 
  onDelete, 
  client 
}: ClientDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [interactions, setInteractions] = useState<ClientInteraction[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'projects' | 'interactions'>('info');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Carregar dados do cliente
  useEffect(() => {
    if (client && isOpen) {
      fetchClientData();
    }
  }, [client, isOpen]);

  const fetchClientData = async () => {
    if (!client) return;
    
    try {
      setLoading(true);
      
      // Carregar projetos do cliente
      const projectsResponse = await apiService.getProjects({ 
        clientId: client.id,
        limit: 50 
      });
      
      if (projectsResponse.success && projectsResponse.data) {
        setProjects((projectsResponse.data as any).projects || []);
      }

      // Carregar interações do cliente (se a API existir)
      // const interactionsResponse = await apiService.getClientInteractions(client.id);
      // if (interactionsResponse.success) {
      //   setInteractions(interactionsResponse.data || []);
      // }
      
    } catch (error) {
      console.error('Erro ao carregar dados do cliente:', error);
      toast.error('Erro ao carregar dados do cliente');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!client) return;
    
    try {
      setLoading(true);
      const response = await apiService.deleteClient(client.id);
      
      if (response.success) {
        toast.success('Cliente excluído com sucesso!');
        onDelete(client.id);
        onClose();
      } else {
        toast.error(response.error?.message || 'Erro ao excluir cliente');
      }
    } catch (error) {
      toast.error('Erro ao excluir cliente');
      console.error('Erro:', error);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const getSizeLabel = (size: string) => {
    const sizeMap: Record<string, string> = {
      small: 'Pequena (1-50)',
      medium: 'Média (51-200)',
      large: 'Grande (200+)'
    };
    return sizeMap[size] || size;
  };

  const getStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      prospect: 'bg-blue-100 text-blue-800',
      churned: 'bg-red-100 text-red-800'
    };
    return statusColors[status] || 'bg-gray-100 text-gray-800';
  };

  const getProjectStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      planning: 'bg-yellow-100 text-yellow-800',
      active: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      on_hold: 'bg-gray-100 text-gray-800'
    };
    return statusColors[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-yux-600 to-yux-700 text-white">
          <div className="flex items-center space-x-3">
            <Building2 className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-semibold">{client.companyName}</h2>
              <p className="text-yux-100 text-sm">{client.contactName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onEdit(client)}
              className="p-2 hover:bg-yux-500 rounded-lg transition-colors"
              title="Editar cliente"
            >
              <Edit className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 hover:bg-red-500 rounded-lg transition-colors"
              title="Excluir cliente"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-yux-500 rounded-lg transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'info', label: 'Informações', icon: FileText },
              { id: 'projects', label: 'Projetos', icon: TrendingUp },
              { id: 'interactions', label: 'Interações', icon: Calendar }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-2 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-yux-500 text-yux-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {activeTab === 'info' && (
            <div className="space-y-6">
              {/* Status e Métricas */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Status</div>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    getStatusColor(client.status)
                  }`}>
                    {client.status === 'active' ? 'Ativo' : 
                     client.status === 'inactive' ? 'Inativo' :
                     client.status === 'prospect' ? 'Prospect' : 'Perdido'}
                  </span>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Projetos</div>
                  <div className="text-2xl font-bold text-gray-900">{client.totalProjects || 0}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Valor Total</div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(client.totalValue || 0)}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Cliente desde</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {formatDate(client.createdAt)}
                  </div>
                </div>
              </div>

              {/* Informações de Contato */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                    <User className="h-5 w-5 text-yux-600" />
                    <span>Informações de Contato</span>
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-900">{client.email}</span>
                    </div>
                    
                    {client.phone && (
                      <div className="flex items-center space-x-3">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-900">{client.phone}</span>
                      </div>
                    )}
                    
                    {client.website && (
                      <div className="flex items-center space-x-3">
                        <Globe className="h-4 w-4 text-gray-400" />
                        <a 
                          href={client.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-yux-600 hover:text-yux-700"
                        >
                          {client.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                    <Building2 className="h-5 w-5 text-yux-600" />
                    <span>Informações da Empresa</span>
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm text-gray-600">Setor:</span>
                      <span className="ml-2 text-gray-900">{client.sector}</span>
                    </div>
                    
                    <div>
                      <span className="text-sm text-gray-600">Tamanho:</span>
                      <span className="ml-2 text-gray-900">{getSizeLabel(client.size)}</span>
                    </div>
                    
                    <div>
                      <span className="text-sm text-gray-600">Fonte do Lead:</span>
                      <span className="ml-2 text-gray-900">{client.leadSource}</span>
                    </div>
                    
                    {client.acquisitionCost && (
                      <div>
                        <span className="text-sm text-gray-600">Custo de Aquisição:</span>
                        <span className="ml-2 text-gray-900">
                          {formatCurrency(client.acquisitionCost)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Endereço */}
              {client.address && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                    <MapPin className="h-5 w-5 text-yux-600" />
                    <span>Endereço</span>
                  </h3>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-gray-900">
                      {client.address.street && client.address.number && (
                        <div>{client.address.street}, {client.address.number}</div>
                      )}
                      {client.address.complement && (
                        <div>{client.address.complement}</div>
                      )}
                      {client.address.neighborhood && (
                        <div>{client.address.neighborhood}</div>
                      )}
                      {client.address.city && client.address.state && (
                        <div>{client.address.city} - {client.address.state}</div>
                      )}
                      {client.address.zipCode && (
                        <div>CEP: {client.address.zipCode}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tags */}
              {client.tags && client.tags.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                    <Tag className="h-5 w-5 text-yux-600" />
                    <span>Tags</span>
                  </h3>
                  
                  <div className="flex flex-wrap gap-2">
                    {client.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yux-100 text-yux-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas */}
              {client.notes && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Notas</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-900 whitespace-pre-wrap">{client.notes}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Projetos</h3>
                <button className="flex items-center space-x-2 px-4 py-2 bg-yux-600 text-white rounded-lg hover:bg-yux-700">
                  <Plus className="h-4 w-4" />
                  <span>Novo Projeto</span>
                </button>
              </div>
              
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yux-600"></div>
                </div>
              ) : projects.length > 0 ? (
                <div className="space-y-4">
                  {projects.map(project => (
                    <div key={project.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">{project.name}</h4>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          getProjectStatusColor(project.status)
                        }`}>
                          {project.status === 'planning' ? 'Planejamento' :
                           project.status === 'active' ? 'Ativo' :
                           project.status === 'completed' ? 'Concluído' :
                           project.status === 'cancelled' ? 'Cancelado' : 'Em Espera'}
                        </span>
                      </div>
                      
                      {project.description && (
                        <p className="text-gray-600 text-sm mb-2">{project.description}</p>
                      )}
                      
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>Valor: {formatCurrency(project.budget || 0)}</span>
                        <span>Criado em: {formatDate(project.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhum projeto encontrado</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'interactions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Interações</h3>
                <button className="flex items-center space-x-2 px-4 py-2 bg-yux-600 text-white rounded-lg hover:bg-yux-700">
                  <Plus className="h-4 w-4" />
                  <span>Nova Interação</span>
                </button>
              </div>
              
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Funcionalidade de interações em desenvolvimento</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Excluir Cliente</h3>
                <p className="text-sm text-gray-500">
                  Tem certeza que deseja excluir {client.companyName}?
                </p>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
              <p className="text-sm text-red-700">
                Esta ação não pode ser desfeita. Todos os dados relacionados ao cliente serão removidos.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                <span>Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}