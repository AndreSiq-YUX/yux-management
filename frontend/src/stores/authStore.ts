import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { backendLogin, backendLogout, backendMe, isNotAuthenticatedError } from '@/services/backendAuthService'

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'client'
  avatar?: string
}

const demoUsers: Record<string, User & { password: string }> = {
  'admin@yux.com.br': {
    id: 'demo-admin',
    name: 'Andre YUX',
    email: 'admin@yux.com.br',
    role: 'admin',
    password: 'admin123',
  },
  'manager@yux.com.br': {
    id: 'demo-manager',
    name: 'Gerente YUX',
    email: 'manager@yux.com.br',
    role: 'manager',
    password: 'manager123',
  },
  'cliente1@empresa.com': {
    id: 'demo-client',
    name: 'Cliente YUX',
    email: 'cliente1@empresa.com',
    role: 'client',
    password: 'client123',
  },
}

function getDemoUser(email: string, password: string) {
  if (!import.meta.env.DEV) return null

  const demoUser = demoUsers[email.toLowerCase()]
  if (!demoUser || demoUser.password !== password) return null

  const { password: _password, ...user } = demoUser
  return user
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  isSessionResolved: boolean
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setLoading: (loading: boolean) => void
  updateUser: (user: Partial<User>) => void
  initialize: () => Promise<void>
}

type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isSessionResolved: false,

      // Actions
      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true })

          try {
            const authData = await backendLogin(email, password)
            set({
              user: authData.user,
              token: authData.token,
              isAuthenticated: true,
              isLoading: false,
              isSessionResolved: true,
            })
          } catch (error) {
            const demoUser = getDemoUser(email, password)
            if (demoUser) {
              set({
                user: demoUser,
                token: 'demo-token',
                isAuthenticated: true,
                isLoading: false,
                isSessionResolved: true,
              })
              return
            }

            throw error
          }
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: async () => {
        try {
          await backendLogout()
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            isSessionResolved: true,
          })
        } catch (error) {
          console.error('Logout error:', error)
          // Force logout even if API call fails
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            isSessionResolved: true,
          })
        }
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      updateUser: (userData: Partial<User>) => {
        const currentUser = get().user
        if (currentUser) {
          set({
            user: { ...currentUser, ...userData },
          })
        }
      },

      initialize: async () => {
        try {
          set({ isLoading: true })

          const authData = await backendMe()
          set({
            user: authData.user,
            token: authData.token,
            isAuthenticated: true,
            isLoading: false,
            isSessionResolved: true,
          })
        } catch (error) {
          if (!isNotAuthenticatedError(error)) {
            console.error('Auth initialization error:', error)
          }
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            isSessionResolved: true,
          })
        }
      },
    }),
    {
      name: 'yux-auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
