-- Restore claim-legacy-member trigger (already present in production).
-- Idempotent: drop then recreate.

DROP TRIGGER IF EXISTS profiles_claim_legacy_member_trg ON public.profiles;

CREATE TRIGGER profiles_claim_legacy_member_trg
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.claim_legacy_member_on_profile();
