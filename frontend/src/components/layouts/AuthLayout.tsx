import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-yux-50 to-yux-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-yux-600 rounded-xl flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">YUX</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Sistema de Gerenciamento
          </h1>
          <p className="text-gray-600 mt-2">
            Faça login para acessar sua conta
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-lg p-6">
          <Outlet />
        </div>
        
        <div className="text-center mt-6 text-sm text-gray-500">
          © 2024 YUX Soluções em IA. Todos os direitos reservados.
        </div>
      </div>
    </div>
  )
}