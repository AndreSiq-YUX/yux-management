import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/services/supabaseService'

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'client'
  avatar?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
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

      // Actions
      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true })
          
          const authData = await supabaseService.signIn(email, password)
          
          if (authData.user) {
            const userData = await supabaseService.getCurrentUser()
            
            if (userData?.profile) {
              const user: User = {
                id: userData.profile.id,
                name: userData.profile.name,
                email: authData.user.email || '',
                role: userData.profile.role.toLowerCase() as 'admin' | 'manager' | 'client',
                avatar: userData.profile.avatar || undefined
              }

              set({
                user,
                token: authData.session?.access_token || 'fake-token',
                isAuthenticated: true,
                isLoading: false,
              })
            }
          }
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: async () => {
        try {
          await supabaseService.signOut()
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          })
        } catch (error) {
          console.error('Logout error:', error)
          // Force logout even if API call fails
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
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
            user: { ...currentUser, ...userData }
          })
        }
      },

      initialize: async () => {
        try {
          set({ isLoading: true })
          
          const { data: { session } } = await supabase.auth.getSession()
          
          if (session?.user) {
            const userData = await supabaseService.getCurrentUser()
            
            if (userData?.profile) {
              const user: User = {
                id: userData.profile.id,
                name: userData.profile.name,
                email: session.user.email || '',
                role: userData.profile.role.toLowerCase() as 'admin' | 'manager' | 'client',
                avatar: userData.profile.avatar || undefined
              }

              set({
                user,
                isAuthenticated: true,
                isLoading: false,
              })
            } else {
              set({ isLoading: false })
            }
          } else {
            set({ isLoading: false })
          }
        } catch (error) {
          console.error('Auth initialization error:', error)
          set({ isLoading: false })
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
    }
  )
)

// Listen to auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    // Atualiza somente o estado local para evitar loop com signOut()
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    })
  }
  if (event === 'SIGNED_IN' && session?.user) {
    // Mantemos sem efeitos colaterais pesados aqui para evitar loops.
    // A sincronização completa pode ser feita via initialize() quando necessário.
  }
})