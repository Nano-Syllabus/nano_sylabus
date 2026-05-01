update public.subscription_plans
set is_active = false,
    updated_at = now()
where slug in ('starter-pack', 'focus-pack', 'marathon-pack');
