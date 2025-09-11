import React, { useState, useRef } from 'react';
import { X, Upload, Download, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '@/services/api';

interface ClientImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
  duplicates: number;
}

export function ClientImportModal({ isOpen, onClose, onSuccess }: ClientImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!allowedTypes.includes(selectedFile.type)) {
      toast.error('Formato de arquivo não suportado. Use CSV ou Excel.');
      return;
    }
    
    if (selectedFile.size > 5 * 1024 * 1024) { // 5MB
      toast.error('Arquivo muito grande. Tamanho máximo: 5MB');
      return;
    }
    
    setFile(selectedFile);
    setResult(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Selecione um arquivo para importar');
      return;
    }

    try {
      setImporting(true);
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiService.importClients(formData);
      
      if (response.success && response.data) {
        const importResult = response.data as ImportResult;
        setResult(importResult);
        
        if (importResult.success) {
          toast.success(`${importResult.imported} clientes importados com sucesso!`);
          onSuccess();
        } else {
          toast.error('Importação concluída com erros. Verifique os detalhes.');
        }
      }
    } catch (error) {
      toast.error('Erro ao importar arquivo');
      console.error('Erro:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await apiService.downloadClientTemplate();
      
      if (response.success && response.data) {
        const blob = new Blob([response.data], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'template_clientes.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast.error('Erro ao baixar template');
      console.error('Erro:', error);
    }
  };

  const resetModal = () => {
    setFile(null);
    setResult(null);
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Importar Clientes
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Template Download */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-900">
                  Template de Importação
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  Baixe o template para garantir que seus dados estejam no formato correto.
                </p>
                <button
                  onClick={handleDownloadTemplate}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1"
                >
                  <Download className="h-4 w-4" />
                  <span>Baixar Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Arquivo de Clientes
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Arraste e solte seu arquivo aqui, ou
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  clique para selecionar
                </button>
                <p className="text-xs text-gray-500">
                  Formatos suportados: CSV, Excel (.xlsx, .xls) - Máx: 5MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
            
            {file && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg flex items-center space-x-3">
                <FileText className="h-5 w-5 text-gray-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Import Results */}
          {result && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${
                result.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-center space-x-2">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <h3 className={`font-medium ${
                    result.success ? 'text-green-900' : 'text-yellow-900'
                  }`}>
                    Resultado da Importação
                  </h3>
                </div>
                <div className="mt-2 text-sm">
                  <p className={result.success ? 'text-green-700' : 'text-yellow-700'}>
                    • {result.imported} clientes importados com sucesso
                  </p>
                  {result.duplicates > 0 && (
                    <p className="text-yellow-700">
                      • {result.duplicates} duplicatas ignoradas
                    </p>
                  )}
                  {result.errors.length > 0 && (
                    <p className="text-red-700">
                      • {result.errors.length} erros encontrados
                    </p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-900 mb-2">Erros Encontrados:</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {result.errors.map((error, index) => (
                      <p key={index} className="text-sm text-red-700">
                        Linha {error.row}: {error.field} - {error.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Importando...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Importar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}