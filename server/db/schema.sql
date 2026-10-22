CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'agent'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TEXT NOT NULL,
  u_number TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at, id);
CREATE INDEX IF NOT EXISTS idx_orders_total ON orders (total_cents, id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders (status, created_at, id);
CREATE INDEX IF NOT EXISTS idx_orders_status_total ON orders (status, total_cents, id);
CREATE INDEX IF NOT EXISTS idx_orders_name_nocase ON orders (customer_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_orders_email_nocase ON orders (customer_email COLLATE NOCASE);
