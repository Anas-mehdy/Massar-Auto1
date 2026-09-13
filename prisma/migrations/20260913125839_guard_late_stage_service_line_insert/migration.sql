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
  new_order_status TEXT;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    new_service_order_id := NEW."serviceOrderId";
    new_shop_id := NEW."shopId";
  END IF;

  IF TG_OP <> 'INSERT' THEN
    old_service_order_id := OLD."serviceOrderId";
    old_shop_id := OLD."shopId";
  END IF;

  -- Serialize line changes with status transitions and invoice creation by
  -- taking the parent ServiceOrder row lock first.
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

  -- New commercial work must be added before the order is declared ready.
  -- To add more work after READY_FOR_DELIVERY, the order must first be moved
  -- back to IN_SERVICE so parts/labor pass through normal consumption/completion.
  IF TG_OP = 'INSERT' THEN
    SELECT so."status"::text
    INTO new_order_status
    FROM public."ServiceOrder" so
    WHERE so."id" = new_service_order_id
      AND so."shopId" = new_shop_id
      AND so."deletedAt" IS NULL;

    IF new_order_status IS NULL THEN
      RAISE EXCEPTION 'Service order does not exist in this shop';
    END IF;

    IF new_order_status IN (
      'READY_FOR_DELIVERY',
      'DELIVERED',
      'CLOSED',
      'REJECTED',
      'CANCELLED'
    ) THEN
      RAISE EXCEPTION 'New service lines cannot be added after the order is ready, delivered, closed, rejected, or cancelled';
    END IF;
  END IF;

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
