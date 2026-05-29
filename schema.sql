CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  software text NOT NULL,
  vendor text NOT NULL DEFAULT '',
  type text NOT NULL,
  license_key text NOT NULL,
  seats integer NOT NULL DEFAULT 1 CHECK (seats > 0),
  expires_at date,
  supplier text NOT NULL DEFAULT '',
  cost numeric(12, 2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users_app (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  department text NOT NULL DEFAULT '',
  device text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users_app(id) ON DELETE CASCADE,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  return_date date,
  status text NOT NULL DEFAULT 'Em uso',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  email text,
  display_name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'member', 'viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE access_users DROP CONSTRAINT IF EXISTS access_users_role_check;
ALTER TABLE access_users ADD CONSTRAINT access_users_role_check CHECK (role IN ('admin', 'member', 'viewer'));
ALTER TABLE access_users ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES access_users(id) ON DELETE SET NULL;

ALTER TABLE users_app
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES access_users(id) ON DELETE SET NULL;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES access_users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS financial_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES licenses(id) ON DELETE SET NULL,
  setor text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT '',
  fornecedor text NOT NULL DEFAULT '',
  filial text NOT NULL DEFAULT '',
  nf text NOT NULL DEFAULT '',
  boleto numeric(12, 2) NOT NULL DEFAULT 0,
  data_emissao date,
  data_vencimento date,
  status_pagamento text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  cod_fornecedor text NOT NULL DEFAULT '',
  nome_fornecedor text NOT NULL DEFAULT '',
  ap text NOT NULL DEFAULT '',
  alerta text NOT NULL DEFAULT '',
  ap_localizada text NOT NULL DEFAULT '',
  motivo_alerta text NOT NULL DEFAULT '',
  enviar_alerta text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES access_users(id) ON DELETE SET NULL,
  username text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE financial_items
  ADD COLUMN IF NOT EXISTS license_id uuid REFERENCES licenses(id) ON DELETE SET NULL;

ALTER TABLE financial_items
  ADD COLUMN IF NOT EXISTS filial text NOT NULL DEFAULT '';

ALTER TABLE financial_items
  ADD COLUMN IF NOT EXISTS nome_fornecedor text NOT NULL DEFAULT '';

ALTER TABLE financial_items
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES access_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_license ON assignments(license_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_users_username ON access_users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_users_email_unique ON access_users (lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_financial_items_vencimento ON financial_items(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_financial_items_fornecedor_nf ON financial_items(fornecedor, nf);
CREATE INDEX IF NOT EXISTS idx_financial_items_license ON financial_items(license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_created_by ON licenses(created_by);
CREATE INDEX IF NOT EXISTS idx_users_app_created_by ON users_app(created_by);
CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON assignments(created_by);
CREATE INDEX IF NOT EXISTS idx_financial_items_created_by ON financial_items(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
