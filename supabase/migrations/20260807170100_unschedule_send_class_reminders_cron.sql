-- Record removal of the send-class-reminders pg_cron job.
-- Live: job already absent from cron.job (last run 2026-08-07 08:10 UTC, then
-- removed outside migrations). Idempotent — safe if already gone.

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'send-class-reminders'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;
