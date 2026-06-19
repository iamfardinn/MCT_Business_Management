-- 015_inventory.sql
-- MCT Business Management System
-- Migration 015: Advanced Inventory & Warehousing

CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL UNIQUE,
    location VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default warehouse
INSERT INTO warehouses (id, name, location) VALUES 
('00000000-0000-0000-0000-000000000001', 'Main Store', 'Head Office')
ON CONFLICT (name) DO NOTHING;

CREATE TYPE inventory_action AS ENUM ('purchase', 'sale', 'adjustment', 'transfer', 'return');

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    action inventory_action NOT NULL,
    quantity NUMERIC(14, 4) NOT NULL, -- positive for IN, negative for OUT
    reference_id UUID, -- Can link to invoice_id, purchase_id, etc.
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inv_tx_product ON inventory_transactions(product_id);
CREATE INDEX idx_inv_tx_warehouse ON inventory_transactions(warehouse_id);

-- Current Stock by Warehouse (Materialized View or Real-time View)
CREATE OR REPLACE VIEW product_stock AS
SELECT 
    product_id,
    warehouse_id,
    SUM(quantity) as current_stock
FROM inventory_transactions
GROUP BY product_id, warehouse_id;
