-- 016_link_products.sql
-- MCT Business Management System
-- Links invoice_items and purchase_items to the products table for inventory tracking

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Backfill product_id where possible
UPDATE invoice_items ii
SET product_id = p.id
FROM products p
WHERE ii.product_name = p.name AND ii.product_id IS NULL;

UPDATE purchase_items pi
SET product_id = p.id
FROM products p
WHERE pi.product_name = p.name AND pi.product_id IS NULL;
