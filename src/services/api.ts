import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp?: string;
  path?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

class ApiService {
  private api: AxiosInstance;

  constructor() {
    // Use environment variable for API URL in production
    const baseURL = (import.meta.env.VITE_API_URL as string)
      ? `${import.meta.env.VITE_API_URL as string}/api`
      : '/api';
      
    this.api = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const authState = useAuthStore.getState();
        if (authState.token) {
          config.headers.Authorization = `Bearer ${authState.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle errors
    this.api.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 errors (token expired)
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // In a real app, you'd refresh the token here
            // For now, just logout the user
            const authStore = useAuthStore.getState();
            authStore.logout();
            toast.error('Sessão expirada. Faça login novamente.');
            window.location.href = '/auth/login';
            return Promise.reject(error);
          } catch (refreshError) {
            // Refresh failed, logout user
            const authStore = useAuthStore.getState();
            authStore.logout();
            toast.error('Sessão expirada. Faça login novamente.');
            window.location.href = '/auth/login';
            return Promise.reject(refreshError);
          }
        }

        // Handle other errors
        const errorMessage = error.response?.data?.error?.message || 'Erro interno do servidor';
        
        // Don't show toast for certain errors that are handled by components
        const silentErrors = ['AUTH_001', 'VALIDATION_ERROR'];
        const errorCode = error.response?.data?.error?.code;
        
        if (!silentErrors.includes(errorCode)) {
          toast.error(errorMessage);
        }

        return Promise.reject(error);
      }
    );
  }

  // Generic methods
  async get<T>(url: string, params?: any): Promise<ApiResponse<T>> {
    const response = await this.api.get(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.api.post(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.api.put(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const response = await this.api.delete(url);
    return response.data;
  }

  // Auth methods
  async login(email: string, password: string) {
    return this.post('/auth/login', { email, password });
  }

  async register(name: string, email: string, password: string, role?: string) {
    return this.post('/auth/register', { name, email, password, role });
  }

  async logout() {
    return this.post('/auth/logout');
  }

  async getCurrentUser() {
    return this.get('/auth/me');
  }

  async refreshToken(refreshToken: string) {
    return this.post('/auth/refresh', { refreshToken });
  }

  // User methods
  async getUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
  }) {
    return this.get('/users', params);
  }

  async getUserById(id: string) {
    return this.get(`/users/${id}`);
  }

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
  }) {
    return this.post('/users', data);
  }

  async updateUser(id: string, data: {
    name?: string;
    email?: string;
    role?: string;
    avatar?: string;
  }) {
    return this.put(`/users/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.delete(`/users/${id}`);
  }

  // Client methods
  async getClients(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    return this.get('/clients', params);
  }

  async getClientById(id: string) {
    return this.get(`/clients/${id}`);
  }

  async createClient(data: any) {
    return this.post('/clients', data);
  }

  async updateClient(id: string, data: any) {
    return this.put(`/clients/${id}`, data);
  }

  async deleteClient(id: string) {
    return this.delete(`/clients/${id}`);
  }

  // Project methods
  async getProjects(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    clientId?: string;
  }) {
    return this.get('/projects', params);
  }

  async getProjectById(id: string) {
    return this.get(`/projects/${id}`);
  }

  async createProject(data: any) {
    return this.post('/projects', data);
  }

  async updateProject(id: string, data: any) {
    return this.put(`/projects/${id}`, data);
  }

  async deleteProject(id: string) {
    return this.delete(`/projects/${id}`);
  }

  // Campaign methods
  async getCampaigns(params?: {
    page?: number;
    limit?: number;
    platform?: string;
    status?: string;
  }) {
    return this.get('/campaigns', params);
  }

  async getCampaignById(id: string) {
    return this.get(`/campaigns/${id}`);
  }

  async syncCampaigns() {
    return this.post('/campaigns/sync');
  }

  async updateCampaignStatus(id: string, status: string) {
    return this.put(`/campaigns/${id}/status`, { status });
  }

  async updateCampaignBudget(id: string, budget: number) {
    return this.put(`/campaigns/${id}/budget`, { budget });
  }

  // Lead methods
  async getLeads(params?: {
    page?: number;
    limit?: number;
    search?: string;
    stage?: string;
    source?: string;
  }) {
    return this.get('/leads', params);
  }

  async getLeadById(id: string) {
    return this.get(`/leads/${id}`);
  }

  async createLead(data: any) {
    return this.post('/leads', data);
  }

  async updateLead(id: string, data: any) {
    return this.put(`/leads/${id}`, data);
  }

  async updateLeadStage(id: string, stage: string) {
    return this.put(`/leads/${id}/stage`, { stage });
  }

  async deleteLead(id: string) {
    return this.delete(`/leads/${id}`);
  }
}

export const apiService = new ApiService();