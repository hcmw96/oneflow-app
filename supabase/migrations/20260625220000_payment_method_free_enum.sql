-- Free intro classes, waitlist promotion, and class invites use payment_method = 'free'.
alter type public.payment_method add value if not exists 'free';
