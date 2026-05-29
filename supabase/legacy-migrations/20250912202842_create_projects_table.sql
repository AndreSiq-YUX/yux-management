-- Create projects table with all necessary fields and relationships

-- First, create the projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'PAUSED', 'CANCELLED')),
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  type VARCHAR(50) NOT NULL CHECK (type IN ('WEBSITE', 'ECOMMERCE', 'MOBILE_APP', 'MARKETING', 'BRANDING', 'CONSULTING', 'OTHER')),
  
  -- Dates
  start_date DATE NOT NULL,
  expected_end_date DATE NOT NULL,
  actual_end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Financial
  budget DECIMAL(15,2) NOT NULL DEFAULT 0,
  actual_cost DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  
  -- Progress
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  completed_tasks INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,
  
  -- Client relationship (foreign key)
  client_id UUID NOT NULL,
  
  -- Team and management
  manager_id UUID,
  team_members UUID[],
  
  -- Configuration
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  tags TEXT[],
  notes TEXT,
  
  -- Constraints
  CONSTRAINT fk_projects_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT valid_dates CHECK (expected_end_date >= start_date),
  CONSTRAINT valid_actual_end_date CHECK (actual_end_date IS NULL OR actual_end_date >= start_date)
);

-- Create project_phases table
CREATE TABLE IF NOT EXISTS project_phases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'completed', 'on_hold')),
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15,2) DEFAULT 0,
  actual_cost DECIMAL(15,2) DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_phases_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT valid_phase_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- Create project_tasks table
CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  phase_id UUID,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID,
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  estimated_hours DECIMAL(8,2),
  actual_hours DECIMAL(8,2),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_phase FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);
CREATE INDEX IF NOT EXISTS idx_projects_expected_end_date ON projects(expected_end_date);
CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS idx_projects_is_archived ON projects(is_archived);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_status ON project_phases(status);
CREATE INDEX IF NOT EXISTS idx_project_phases_order ON project_phases(order_index);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_phase_id ON project_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_priority ON project_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to ON project_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date ON project_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_project_tasks_order ON project_tasks(order_index);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_phases_updated_at BEFORE UPDATE ON project_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_tasks_updated_at BEFORE UPDATE ON project_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for projects
CREATE POLICY "Users can view projects" ON projects
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert projects" ON projects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update projects" ON projects
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete projects" ON projects
  FOR DELETE USING (auth.role() = 'authenticated');

-- Create RLS policies for project_phases
CREATE POLICY "Users can view project phases" ON project_phases
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert project phases" ON project_phases
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update project phases" ON project_phases
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete project phases" ON project_phases
  FOR DELETE USING (auth.role() = 'authenticated');

-- Create RLS policies for project_tasks
CREATE POLICY "Users can view project tasks" ON project_tasks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert project tasks" ON project_tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update project tasks" ON project_tasks
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete project tasks" ON project_tasks
  FOR DELETE USING (auth.role() = 'authenticated');

-- Insert some sample data for testing (optional)
INSERT INTO projects (
  name, 
  description, 
  status, 
  priority, 
  type, 
  start_date, 
  expected_end_date, 
  budget, 
  currency, 
  client_id,
  progress
) VALUES 
(
  'Website Institucional YUX',
  'Desenvolvimento do novo website institucional da YUX com foco em conversão e SEO',
  'ACTIVE',
  'HIGH',
  'WEBSITE',
  '2025-01-01',
  '2025-03-15',
  25000.00,
  'BRL',
  (SELECT id FROM clients LIMIT 1),
  35
),
(
  'E-commerce Loja Virtual',
  'Desenvolvimento de plataforma de e-commerce completa com integração de pagamentos',
  'PLANNING',
  'MEDIUM',
  'ECOMMERCE',
  '2025-02-01',
  '2025-05-30',
  45000.00,
  'BRL',
  (SELECT id FROM clients LIMIT 1),
  0
)
ON CONFLICT DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE projects IS 'Tabela principal de projetos do sistema CRM';
COMMENT ON TABLE project_phases IS 'Fases dos projetos para melhor organização e controle';
COMMENT ON TABLE project_tasks IS 'Tarefas específicas dentro dos projetos e fases';

COMMENT ON COLUMN projects.status IS 'Status do projeto: PLANNING, ACTIVE, REVIEW, COMPLETED, PAUSED, CANCELLED';
COMMENT ON COLUMN projects.priority IS 'Prioridade do projeto: LOW, MEDIUM, HIGH, URGENT';
COMMENT ON COLUMN projects.type IS 'Tipo do projeto: WEBSITE, ECOMMERCE, MOBILE_APP, MARKETING, BRANDING, CONSULTING, OTHER';
COMMENT ON COLUMN projects.progress IS 'Progresso do projeto em porcentagem (0-100)';
COMMENT ON COLUMN projects.client_id IS 'ID do cliente associado ao projeto';
COMMENT ON COLUMN projects.manager_id IS 'ID do gerente responsável pelo projeto';
COMMENT ON COLUMN projects.team_members IS 'Array de IDs dos membros da equipe';
COMMENT ON COLUMN projects.is_active IS 'Indica se o projeto está ativo';
COMMENT ON COLUMN projects.is_archived IS 'Indica se o projeto foi arquivado';