-- Pass 1: Pilates Flow was stored as sculpt; align class rows + allow-lists.
-- pilates is already a valid class_type enum value — no ALTER TYPE.

BEGIN;

-- Expected: 379 rows (investigation 2026-08-06)
UPDATE public.classes
SET class_type = 'pilates'
WHERE name = 'Pilates Flow'
  AND class_type = 'sculpt';

-- Expected: 14 rows (active products with sculpt, without pilates; inactive excluded)
UPDATE public.products
SET allowed_class_types = array_append(allowed_class_types, 'pilates'::class_type)
WHERE allowed_class_types IS NOT NULL
  AND 'sculpt' = ANY (allowed_class_types)
  AND NOT ('pilates' = ANY (allowed_class_types))
  AND COALESCE(is_active, true) = true;

-- Expected: ~2 usable non-expired rows from investigation; predicate updates every
-- matching credit row (11 at investigation time, including spent/expired).
UPDATE public.user_credits
SET allowed_class_types = array_append(allowed_class_types, 'pilates'::class_type)
WHERE allowed_class_types IS NOT NULL
  AND 'sculpt' = ANY (allowed_class_types)
  AND NOT ('pilates' = ANY (allowed_class_types));

COMMIT;
