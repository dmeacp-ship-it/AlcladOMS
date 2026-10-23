-- migrate-005: one tax invoice per DO/PI batch. Run in Supabase -> SQL Editor.
alter table order_batches add column if not exists tax_invoice_path text;
