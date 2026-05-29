-- YUX Client Management System - Row Level Security Policies
-- Migration: 20240101000001_rls_policies.sql

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
BEGIN
  RETURN (SELECT role FROM users WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is admin or manager
CREATE OR REPLACE FUNCTION is_admin_or_manager(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT role FROM users WHERE id = user_id) IN ('ADMIN', 'MANAGER');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users table policies
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins and managers can view all users" ON users
  FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can manage all users" ON users
  FOR ALL USING (get_user_role(auth.uid()) = 'ADMIN');

-- Clients table policies
CREATE POLICY "Clients can view own data" ON clients
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins and managers can view all clients" ON clients
  FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can manage clients" ON clients
  FOR ALL USING (is_admin_or_manager(auth.uid()));

-- Projects table policies
CREATE POLICY "Clients can view own projects" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = projects.client_id 
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can view all projects" ON projects
  FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can manage projects" ON projects
  FOR ALL USING (is_admin_or_manager(auth.uid()));

-- Project phases table policies
CREATE POLICY "Clients can view own project phases" ON project_phases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN clients c ON c.id = p.client_id
      WHERE p.id = project_phases.project_id 
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can view all project phases" ON project_phases
  FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can manage project phases" ON project_phases
  FOR ALL USING (is_admin_or_manager(auth.uid()));

-- Deliverables table policies
CREATE POLICY "Clients can view own deliverables" ON deliverables
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_phases pp
      JOIN projects p ON p.id = pp.project_id
      JOIN clients c ON c.id = p.client_id
      WHERE pp.id = deliverables.phase_id 
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can approve own deliverables" ON deliverables
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_phases pp
      JOIN projects p ON p.id = pp.project_id
      JOIN clients c ON c.id = p.client_id
      WHERE pp.id = deliverables.phase_id 
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can view all deliverables" ON deliverables
  FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can manage deliverables" ON deliverables
  FOR ALL USING (is_admin_or_manager(auth.uid()));

-- Campaigns table policies (admin/manager only)
CREATE POLICY "Admins and managers can view campaigns" ON campaigns
  FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can manage campaigns" ON campaigns
  FOR ALL USING (is_admin_or_manager(auth.uid()));

-- Leads table policies (admin/manager only)
CREATE POLICY "Admins and managers can view leads" ON leads
  FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can manage leads" ON leads
  FOR ALL USING (is_admin_or_manager(auth.uid()));

-- Interactions table policies
CREATE POLICY "Clients can view own interactions" ON interactions
  FOR SELECT USING (
    (client_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = interactions.client_id 
      AND clients.user_id = auth.uid()
    )) OR
    (lead_id IS NOT NULL AND is_admin_or_manager(auth.uid()))
  );

CREATE POLICY "Admins and managers can view all interactions" ON interactions
  FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can manage interactions" ON interactions
  FOR ALL USING (is_admin_or_manager(auth.uid()));

-- System config table policies (admin only)
CREATE POLICY "Admins can manage system config" ON system_config
  FOR ALL USING (get_user_role(auth.uid()) = 'ADMIN');

-- Create function to handle user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'CLIENT')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();