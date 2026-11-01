-- Part-time members may read recipes and change inventory quantity only.
-- Keep all existing rows/history. Inventory trigger also guards SECURITY DEFINER writes.
BEGIN;

-- These older permissive policies otherwise OR with the recipe management rules.
DROP POLICY IF EXISTS recipes_member_insert ON public.recipes;
DROP POLICY IF EXISTS recipes_member_update ON public.recipes;

-- SELECT stays member-readable. Restrictive write policies also constrain any older permissive policy.
DROP POLICY IF EXISTS recipes_catalog_insert_gate ON public.recipes;
CREATE POLICY recipes_catalog_insert_gate ON public.recipes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((public.is_store_admin(store_id) OR public.can_manage_recipes(store_id)));
DROP POLICY IF EXISTS recipes_catalog_update_gate ON public.recipes;
CREATE POLICY recipes_catalog_update_gate ON public.recipes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((public.is_store_admin(store_id) OR public.can_manage_recipes(store_id)))
  WITH CHECK ((public.is_store_admin(store_id) OR public.can_manage_recipes(store_id)));
DROP POLICY IF EXISTS recipes_catalog_delete_gate ON public.recipes;
CREATE POLICY recipes_catalog_delete_gate ON public.recipes AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((public.is_store_admin(store_id) OR public.can_manage_recipes(store_id)))
;
DROP POLICY IF EXISTS recipe_ingredients_catalog_insert_gate ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_catalog_insert_gate ON public.recipe_ingredients AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id=recipe_id AND (public.is_store_admin(r.store_id) OR public.can_manage_recipes(r.store_id))));
DROP POLICY IF EXISTS recipe_ingredients_catalog_update_gate ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_catalog_update_gate ON public.recipe_ingredients AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id=recipe_id AND (public.is_store_admin(r.store_id) OR public.can_manage_recipes(r.store_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id=recipe_id AND (public.is_store_admin(r.store_id) OR public.can_manage_recipes(r.store_id))));
DROP POLICY IF EXISTS recipe_ingredients_catalog_delete_gate ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_catalog_delete_gate ON public.recipe_ingredients AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id=recipe_id AND (public.is_store_admin(r.store_id) OR public.can_manage_recipes(r.store_id))))
;

-- SECURITY DEFINER recipe RPCs must retain their existing can_manage_recipes guards.

CREATE OR REPLACE FUNCTION public.guard_part_time_inventory_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
  IF TG_OP='INSERT' THEN sid:=NEW.store_id; ELSE sid:=OLD.store_id; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_store_admin(sid) AND public.is_store_part_timer(sid) THEN
    IF TG_OP <> 'UPDATE' THEN
      RAISE EXCEPTION 'INVENTORY_QUANTITY_ONLY' USING ERRCODE='42501';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['current_stock','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['current_stock','updated_at']) THEN
      RAISE EXCEPTION 'INVENTORY_QUANTITY_ONLY' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id AND auth.uid() IS NOT NULL
     AND NOT public.is_store_admin(NEW.store_id) AND public.is_store_part_timer(NEW.store_id) THEN
    RAISE EXCEPTION 'INVENTORY_QUANTITY_ONLY' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_part_time_inventory_write() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_part_time_inventory_write ON public.ingredients;
CREATE TRIGGER guard_part_time_inventory_write BEFORE INSERT OR UPDATE OR DELETE ON public.ingredients
FOR EACH ROW EXECUTE FUNCTION public.guard_part_time_inventory_write();
COMMIT;
