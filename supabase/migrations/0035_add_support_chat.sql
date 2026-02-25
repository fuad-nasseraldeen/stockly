CREATE TABLE IF NOT EXISTS support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_threads_user_idx
  ON support_threads (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_threads_status_last_msg_idx
  ON support_threads (status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('user', 'support')),
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_messages_thread_created_idx
  ON support_messages (thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS support_messages_thread_unread_idx
  ON support_messages (thread_id, read_at)
  WHERE read_at IS NULL;
