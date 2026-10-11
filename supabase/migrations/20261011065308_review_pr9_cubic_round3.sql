-- Pulkro Cuadrillas · backend 17 · review round 8 (PR #9, cubic, 2026-10-11)
-- J1 every person recorded on a visible order stays readable: referenced_profile_ids now covers every profile reference of
-- the order and its records (field capture, incidents, photos, closures, reports, shares, surveys, cases), not only the
-- first set. audit_log keeps its own actor_name snapshot and is left out. Signatures are unchanged.
-- See docs/backend/architecture.md §4.

create or replace function private.referenced_profile_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with v as materialized (select private.visible_order_ids() as ids)
  select coalesce(array_agg(distinct x.id) filter (where x.id is not null), '{}')
  from (
    select t.supervisor_id as id from public.orders t, v where t.id = any (v.ids)
    union all select t.created_by from public.orders t, v where t.id = any (v.ids)
    union all select t.supervisor_id from private.order_assignments t, v where t.order_id = any (v.ids)
    union all select t.created_by from public.crew_changes t, v where t.order_id = any (v.ids)
    union all select t.created_by from public.jornada_checks t, v where t.order_id = any (v.ids)
    union all select t.created_by from public.jornada_notes t, v where t.order_id = any (v.ids)
    union all select t.created_by from public.incidents t, v where t.order_id = any (v.ids)
    union all select t.resolved_by from public.incidents t, v where t.order_id = any (v.ids)
    union all select t.owner_id from public.post_sale_cases t, v where t.order_id = any (v.ids)
    union all select t.created_by from public.post_sale_cases t, v where t.order_id = any (v.ids)
    union all select t.created_by from public.case_events t, v where t.order_id = any (v.ids)
    union all select t.created_by from public.photos t, v where t.order_id = any (v.ids)
    union all select t.deleted_by from public.photos t, v where t.order_id = any (v.ids)
    union all select t.validated_by from public.order_closures t, v where t.order_id = any (v.ids)
    union all select t.exception_authorized_by from public.order_closures t, v where t.order_id = any (v.ids)
    union all select t.generated_by from public.reports t, v where t.order_id = any (v.ids)
    union all select t.created_by from public.report_shares t, v where t.order_id = any (v.ids)
    union all select t.sent_by from public.surveys t, v where t.order_id = any (v.ids)
    union all select t.recorded_by from public.surveys t, v where t.order_id = any (v.ids)
  ) x;
$$;