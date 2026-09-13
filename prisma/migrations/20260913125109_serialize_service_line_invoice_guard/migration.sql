CREATE OR REPLACE FUNCTION public."assertServiceOrderLinesNotInvoiced"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  new_service_order_id UUID;
  new_shop_id UUID;
  old_service_order_id UUID;
  old_shop_id UUID;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    new_service_order_id := NEW."serviceOrderId";
    new_shop_id := NEW."shopId";
  END IF;

  IF TG_OP <> 'INSERT' THEN
    old_service_order_id := OLD."serviceOrderId";
    old_shop_id := OLD."shopId";
  END IF;

  -- Serialize service-line changes with invoice creation/status changes by
  -- locking the same parent ServiceOrder row first. Ordering keeps UPDATEs
  -- involving two parents deterministic and avoids lock-order inversions.
  PERFORM 1
  FROM public."ServiceOrder" so
  WHERE (
      new_service_order_id IS NOT NULL
      AND so."id" = new_service_order_id
      AND so."shopId" = new_shop_id
    ) OR (
      old_service_order_id IS NOT NULL
      AND so."id" = old_service_order_id
      AND so."shopId" = old_shop_id
    )
  ORDER BY so."shopId", so."id"
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public."Invoice" inv
    WHERE inv."deletedAt" IS NULL
      AND inv."status" <> 'VOID'::public."InvoiceStatus"
      AND (
        (
          new_service_order_id IS NOT NULL
          AND inv."shopId" = new_shop_id
          AND inv."serviceOrderId" = new_service_order_id
        ) OR (
          old_service_order_id IS NOT NULL
          AND inv."shopId" = old_shop_id
          AND inv."serviceOrderId" = old_service_order_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Service order lines are locked after an active invoice is issued';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
