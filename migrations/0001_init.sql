-- Tenants (your customers; your own portfolio can be a tenant too)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

-- Users (auth later; store email for now)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL
);

-- Roles per tenant
CREATE TABLE IF NOT EXISTS memberships (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sites per tenant
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  subdomain TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Pages stored as JSON (for your editor)
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  path TEXT NOT NULL,           -- '/', '/about', etc.
  data JSON NOT NULL,           -- editor JSON
  updated_at INTEGER NOT NULL,  -- epoch ms
  UNIQUE (site_id, path),
  FOREIGN KEY (site_id) REFERENCES sites(id)
);
