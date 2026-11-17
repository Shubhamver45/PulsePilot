-- Organization-specific audit sequence and append-only hash chain.
DROP INDEX IF EXISTS public."audit_logs_sequenceNumber_key";
DROP INDEX IF EXISTS public.audit_logs_sequence_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS "audit_logs_organizationId_sequenceNumber_key"
  ON public.audit_logs ("organizationId", "sequenceNumber");
