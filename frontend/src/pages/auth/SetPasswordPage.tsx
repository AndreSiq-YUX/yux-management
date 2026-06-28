import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { setInvitationPassword } from '@/services/backendAuthService'

const schema = z.object({
  password: z.string().min(10, 'Senha deve ter pelo menos 10 caracteres'),
  confirmPassword: z.string().min(10, 'Confirme a senha'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas nao conferem',
  path: ['confirmPassword'],
})

type SetPasswordForm = z.infer<typeof schema>

export function SetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const token = searchParams.get('token') || ''

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordForm>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: SetPasswordForm) {
    if (!token) {
      toast.error('Convite invalido')
      return
    }

    try {
      setLoading(true)
      await setInvitationPassword(token, data.password)
      toast.success('Senha definida com sucesso')
      navigate('/auth/login')
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel definir a senha')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Convite invalido</h2>
        <p className="text-sm text-gray-600">Solicite um novo convite de acesso.</p>
        <Link to="/auth/login" className="inline-flex text-sm font-medium text-yux-700 hover:text-yux-800">
          Voltar ao login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Definir senha</h2>
        <p className="mt-1 text-sm text-gray-600">Crie a senha de acesso ao YUX Hub.</p>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Nova senha
        </label>
        <input
          {...register('password')}
          id="password"
          type="password"
          autoComplete="new-password"
          className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-yux-500 focus:ring-yux-500 sm:text-sm"
        />
        {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          Confirmar senha
        </label>
        <input
          {...register('confirmPassword')}
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 shadow-sm focus:border-yux-500 focus:ring-yux-500 sm:text-sm"
        />
        {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full justify-center rounded-md border border-transparent bg-yux-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-yux-700 focus:outline-none focus:ring-2 focus:ring-yux-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : (
          'Salvar senha'
        )}
      </button>
    </form>
  )
}
