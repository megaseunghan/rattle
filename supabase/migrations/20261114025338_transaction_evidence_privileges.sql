-- Supabase projects can grant ALL on new public tables through default privileges.
-- RLS does not constrain TRUNCATE. Reset only this new feature table's grants.
BEGIN;
REVOKE ALL ON TABLE public.transaction_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.transaction_evidence TO authenticated;
COMMIT;
