import { useState } from 'react';
import { Filter, X, ChevronDown } from 'lucide-react';
import { CLIENT_SECTORS, CLIENT_SIZES, LEAD_SOURCES, ClientFilters as ClientFiltersType } from '@/types/client';

interface ClientFiltersProps {
  filters: ClientFiltersType;
  onFiltersChange: (filters: ClientFiltersType) => void;
  onClearFilters: () => void;
}

export function ClientFilters({ filters, onFiltersChange, onClearFilters }: ClientFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleFilterChange = (key: keyof ClientFiltersType, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== undefined && value !== null && value !== '';
  });

  const activeFiltersCount = Object.values(filters).reduce((count, value) => {
    if (Array.isArray(value)) {
      return count + (value.length > 0 ? 1 : 0);
    }
    return count + (value !== undefined && value !== null && value !== '' ? 1 : 0);
  }, 0);

  return (
    <div className="relative">
      {/* Botão de Filtros */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors ${
          hasActiveFilters 
            ? 'border-yux-500 bg-yux-50 text-yux-700' 
            : 'border-gray-300 text-gray-700'
        }`}
      >
        <Filter className="h-4 w-4" />
        <span>Filtros</span>
        {activeFiltersCount > 0 && (
          <span className="bg-yux-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
            {activeFiltersCount}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 transition-transform ${
          isOpen ? 'rotate-180' : ''
        }`} />
      </button>

      {/* Painel de Filtros */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Setor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Setor
              </label>
              <select
                value={filters.sector || ''}
                onChange={(e) => handleFilterChange('sector', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
              >
                <option value="">Todos os setores</option>
                {CLIENT_SECTORS.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>

            {/* Tamanho da Empresa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tamanho da Empresa
              </label>
              <div className="space-y-2">
                {CLIENT_SIZES.map(size => (
                  <label key={size.value} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.sizes?.includes(size.value) || false}
                      onChange={(e) => {
                        const currentSizes = filters.sizes || [];
                        if (e.target.checked) {
                          handleFilterChange('sizes', [...currentSizes, size.value]);
                        } else {
                          handleFilterChange('sizes', currentSizes.filter(s => s !== size.value));
                        }
                      }}
                      className="rounded border-gray-300 text-yux-600 focus:ring-yux-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">{size.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Fonte do Lead */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fonte do Lead
              </label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {LEAD_SOURCES.map(source => (
                  <label key={source} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.leadSources?.includes(source) || false}
                      onChange={(e) => {
                        const currentSources = filters.leadSources || [];
                        if (e.target.checked) {
                          handleFilterChange('leadSources', [...currentSources, source]);
                        } else {
                          handleFilterChange('leadSources', currentSources.filter(s => s !== source));
                        }
                      }}
                      className="rounded border-gray-300 text-yux-600 focus:ring-yux-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">{source}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <div className="space-y-2">
                {[
                  { value: 'active', label: 'Ativo' },
                  { value: 'inactive', label: 'Inativo' },
                  { value: 'prospect', label: 'Prospect' },
                  { value: 'churned', label: 'Perdido' }
                ].map(status => (
                  <label key={status.value} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.statuses?.includes(status.value as any) || false}
                      onChange={(e) => {
                        const currentStatuses = filters.statuses || [];
                        if (e.target.checked) {
                          handleFilterChange('statuses', [...currentStatuses, status.value]);
                        } else {
                          handleFilterChange('statuses', currentStatuses.filter(s => s !== status.value));
                        }
                      }}
                      className="rounded border-gray-300 text-yux-600 focus:ring-yux-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">{status.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Faixa de Valor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Valor Total (R$)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    placeholder="Mínimo"
                    value={filters.minValue || ''}
                    onChange={(e) => handleFilterChange('minValue', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Máximo"
                    value={filters.maxValue || ''}
                    onChange={(e) => handleFilterChange('maxValue', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                  />
                </div>
              </div>
            </div>

            {/* Data de Criação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data de Criação
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => handleFilterChange('startDate', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => handleFilterChange('endDate', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
                  />
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex justify-between pt-4 border-t">
              <button
                onClick={() => {
                  onClearFilters();
                  setIsOpen(false);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                disabled={!hasActiveFilters}
              >
                Limpar Filtros
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-yux-600 text-white rounded-md hover:bg-yux-700 transition-colors"
              >
                Aplicar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay para fechar o painel */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}