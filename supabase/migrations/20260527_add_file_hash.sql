-- Migração: Adicionar file_hash à tabela policies para evitar duplicidade de processamento
-- Execute no SQL Editor do Supabase

ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_policies_file_hash ON public.policies(file_hash, organization_id);
