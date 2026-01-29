-- Migration 0009: User Management & Blocking System
-- Add user blocking capability and audit logging

-- Add is_blocked field to memberships
ALTER TABLE memberships 
  ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false NOT NULL;

-- Add blocked_at timestamp
ALTER TABLE memberships 
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- Add blocked_by reference (who blocked this user)
ALTER TABLE memberships 
  ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES auth.users(id);

-- Add index for blocked users
CREATE INDEX IF NOT EXISTS memberships_blocked_idx 
  ON memberships (tenant_id, is_blocked) 
  WHERE is_blocked = true;

-- Audit logs table for tracking user activity
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'tenant_created', 'user_joined', 'user_blocked', 'user_unblocked', 'invite_sent', etc.
  details jsonb, -- Additional context (email, role, etc.)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action, created_at DESC);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Owners can read audit logs for their tenants
CREATE POLICY "Owners can read audit logs for their tenants"
  ON audit_logs FOR SELECT
  USING (
    is_member(tenant_id) AND get_tenant_role(tenant_id) = 'owner'
  );

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_tenant_id uuid,
  p_user_id uuid,
  p_action text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_logs (tenant_id, user_id, action, details)
  VALUES (p_tenant_id, p_user_id, p_action, p_details);
END;
$$;

-- Trigger: Log when a membership is created (user joins tenant)
CREATE OR REPLACE FUNCTION log_membership_created()
RETURNS trigger AS $$
BEGIN
  PERFORM log_audit_event(
    NEW.tenant_id,
    NEW.user_id,
    'user_joined',
    jsonb_build_object(
      'role', NEW.role,
      'user_email', (SELECT email FROM auth.users WHERE id = NEW.user_id)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_membership_created ON memberships;
CREATE TRIGGER on_membership_created
  AFTER INSERT ON memberships
  FOR EACH ROW
  EXECUTE FUNCTION log_membership_created();

-- Trigger: Log when a tenant is created
CREATE OR REPLACE FUNCTION log_tenant_created()
RETURNS trigger AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Get the owner who created this tenant (first membership with role 'owner')
  SELECT user_id INTO v_owner_id
  FROM memberships
  WHERE tenant_id = NEW.id AND role = 'owner'
  LIMIT 1;
  
  PERFORM log_audit_event(
    NEW.id,
    v_owner_id,
    'tenant_created',
    jsonb_build_object('tenant_name', NEW.name)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_tenant_created ON tenants;
CREATE TRIGGER on_tenant_created
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION log_tenant_created();

-- Trigger: Log when an invite is sent
CREATE OR REPLACE FUNCTION log_invite_sent()
RETURNS trigger AS $$
BEGIN
  PERFORM log_audit_event(
    NEW.tenant_id,
    NEW.invited_by,
    'invite_sent',
    jsonb_build_object(
      'email', NEW.email,
      'role', NEW.role
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_invite_sent ON invites;
CREATE TRIGGER on_invite_sent
  AFTER INSERT ON invites
  FOR EACH ROW
  EXECUTE FUNCTION log_invite_sent();
