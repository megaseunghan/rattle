-- Client roles never need whole-table deletion. Preserve row access/RLS and server-owned RPCs.
-- Reviewed against the 2026-11-01 remote ACL audit. No data is modified by this migration.
BEGIN;
REVOKE TRUNCATE ON TABLE
  public.employee_wage_history,
  public.employees,
  public.expenses,
  public.ingredients,
  public.manual_sales,
  public.payroll,
  public.purchase_items,
  public.purchases,
  public.recipe_ingredients,
  public.recipes,
  public.toss_order_items,
  public.toss_orders
FROM anon, authenticated;
COMMIT;
