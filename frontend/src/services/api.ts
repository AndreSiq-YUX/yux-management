import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { backendDataService } from '@/services/backendDataService';
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
    sector?: string;
    size?: string;
    status?: string;
    leadSource?: string;
    assignedTo?: string;
    minLifetimeValue?: number;
    maxLifetimeValue?: number;
    createdAfter?: string;
    createdBefore?: string;
    hasActiveProjects?: boolean;
    tags?: string[];
    sizes?: string[];
    leadSources?: string[];
    statuses?: string[];
    minValue?: number;
    maxValue?: number;
    startDate?: string;
    endDate?: string;
  }) {
    return this.get('/clients', params);
  }

  async getClientById(id: string) {
    return this.get(`/clients/${id}`);
  }

  async createClient(data: {
    companyName: string;
    contactName: string;
    email: string;
    phone?: string;
    website?: string;
    sector: string;
    size: string;
    leadSource: string;
    acquisitionCost?: number;
    address?: {
      street?: string;
      number?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    };
    notes?: string;
    tags?: string[];
    assignedTo?: string;
    preferredTechnologies?: string[];
    communicationPreferences?: string[];
  }) {
    return this.post('/clients', data);
  }

  async updateClient(id: string, data: {
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    website?: string;
    sector?: string;
    size?: string;
    leadSource?: string;
    acquisitionCost?: number;
    lifetimeValue?: number;
    totalRevenue?: number;
    status?: string;
    address?: {
      street?: string;
      number?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    };
    notes?: string;
    tags?: string[];
    assignedTo?: string;
    preferredTechnologies?: string[];
    communicationPreferences?: string[];
  }) {
    return this.put(`/clients/${id}`, data);
  }

  async deleteClient(id: string) {
    return this.delete(`/clients/${id}`);
  }

  async getClientStats() {
    return this.get('/clients/stats');
  }

  async exportClients(format: 'csv' | 'excel', filters?: any): Promise<ApiResponse<Blob>> {
    const params = { format, ...filters };
    const response = await this.api.get('/clients/export', { params, responseType: 'blob' as const });
    return {
      success: true,
      data: response.data as Blob,
    };
  }

  async importClients(formData: FormData) {
    return this.post('/clients/import', formData);
  }

  async downloadClientTemplate(): Promise<ApiResponse<Blob>> {
    const response = await this.api.get('/clients/template', { responseType: 'blob' as const });
    return {
      success: true,
      data: response.data as Blob,
    };
  }

  // Client-Project integration methods
  async getClientProjects(clientId: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    return this.get(`/clients/${clientId}/projects`, params);
  }

  async getClientInteractions(clientId: string, params?: {
    page?: number;
    limit?: number;
    type?: string;
  }) {
    return this.get(`/clients/${clientId}/interactions`, params);
  }

  async createClientInteraction(clientId: string, data: {
    type: string;
    date: string;
    description: string;
    outcome?: string;
    nextAction?: string;
  }) {
    return this.post(`/clients/${clientId}/interactions`, data);
  }

  async updateClientStats(clientId: string) {
    return this.put(`/clients/${clientId}/stats`);
  }

  // Project methods - using backendDataService
  async getProjects(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
    type?: string;
    clientId?: string;
    managerId?: string;
    startDateFrom?: string;
    startDateTo?: string;
    budgetMin?: number;
    budgetMax?: number;
  }) {
    return backendDataService.getProjects(params);
  }

  async getProjectById(id: string) {
    return backendDataService.getProjectById(id);
  }

  async createProject(data: {
    name: string;
    description: string;
    status: string;
    priority: string;
    type: string;
    startDate: string;
    expectedEndDate: string;
    budget: number;
    currency: string;
    clientId: string;
    managerId?: string;
    teamMembers?: string[];
    tags?: string[];
    notes?: string;
  }) {
    return backendDataService.createProject(data);
  }

  async updateProject(id: string, data: {
    name?: string;
    description?: string;
    status?: string;
    priority?: string;
    type?: string;
    startDate?: string;
    expectedEndDate?: string;
    actualEndDate?: string;
    budget?: number;
    currency?: string;
    clientId?: string;
    managerId?: string;
    teamMembers?: string[];
    tags?: string[];
    notes?: string;
    progress?: number;
  }) {
    return backendDataService.updateProject(id, data);
  }

  async deleteProject(id: string) {
    return backendDataService.deleteProject(id);
  }

  async getProjectStats() {
    return backendDataService.getProjectStats();
  }

  async updateProjectStatus(id: string, status: string) {
    return backendDataService.updateProject(id, { status });
  }

  async updateProjectProgress(id: string, progress: number) {
    return backendDataService.updateProject(id, { progress });
  }

  async getProjectsByClient(clientId: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
    includeArchived?: boolean;
  }) {
    return backendDataService.getProjectsByClient(clientId, params);
  }

  async duplicateProject(id: string, data?: {
    name?: string;
    clientId?: string;
    startDate?: string;
  }) {
    return backendDataService.duplicateProject(id, data);
  }

  async archiveProject(id: string) {
    return backendDataService.archiveProject(id);
  }

  async unarchiveProject(id: string) {
    return backendDataService.unarchiveProject(id);
  }

  // Project Tasks methods
  async getProjectTasks(projectId: string) {
    try {
      const response = await this.get(`/projects/${projectId}/tasks`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Erro ao buscar tarefas do projeto:', error);
      return { success: false, error };
    }
  }

  async createProjectTask(projectId: string, data: {
    title: string;
    description?: string;
    status: string;
    priority: string;
    assignedTo?: string;
    dueDate?: string;
    estimatedHours?: number;
  }) {
    return this.post(`/projects/${projectId}/tasks`, data);
  }

  async updateProjectTask(projectId: string, taskId: string, data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    dueDate?: string;
    estimatedHours?: number;
    actualHours?: number;
  }) {
    return this.put(`/projects/${projectId}/tasks/${taskId}`, data);
  }

  async deleteProjectTask(projectId: string, taskId: string) {
    return this.delete(`/projects/${projectId}/tasks/${taskId}`);
  }

  // Project Phases methods
  async getProjectPhases(projectId: string) {
    try {
      const response = await this.get(`/projects/${projectId}/phases`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Erro ao buscar fases do projeto:', error);
      return { success: false, error };
    }
  }

  async createProjectPhase(projectId: string, data: {
    name: string;
    description?: string;
    startDate: string;
    endDate: string;
    order: number;
  }) {
    return this.post(`/projects/${projectId}/phases`, data);
  }

  async updateProjectPhase(projectId: string, phaseId: string, data: {
    name?: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    progress?: number;
  }) {
    return this.put(`/projects/${projectId}/phases/${phaseId}`, data);
  }

  async deleteProjectPhase(projectId: string, phaseId: string) {
    return this.delete(`/projects/${projectId}/phases/${phaseId}`);
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



  async getPhaseById(id: string) {
    return this.get(`/phases/${id}`);
  }

  async createPhase(data: any) {
    return this.post('/phases', data);
  }

  async updatePhase(id: string, data: any) {
    return this.put(`/phases/${id}`, data);
  }

  async deletePhase(id: string) {
    return this.delete(`/phases/${id}`);
  }

  async updatePhaseStatus(id: string, status: string) {
    return this.put(`/phases/${id}/status`, { status });
  }

  // ===== PROJECT ANALYTICS =====
  async getProjectAnalytics(projectId: string) {
    return this.get(`/projects/${projectId}/analytics`);
  }

  async calculateProjectProgress(projectId: string) {
    return this.get(`/projects/${projectId}/progress`);
  }
}

export const apiService = new ApiService();
