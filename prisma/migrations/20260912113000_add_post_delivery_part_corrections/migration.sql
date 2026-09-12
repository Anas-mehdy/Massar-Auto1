-- Post-delivery service-part corrections.
-- Keep the original invoiced ServicePartLine immutable and record any physical/operational
-- correction separately. Financial correction remains an explicit InvoiceCreditNote flow.

CREATE TABLE "ServicePartCorrection" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "serviceOrderId" UUID NOT NULL,
  "servicePartLineId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "creditNoteId" UUID,
  "createdByUserId" UUID,
  "correctionNumber" TEXT NOT NULL,
  "reasonCode" VARCHAR(32) NOT NULL,
  "inventoryDisposition" VARCHAR(24) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "inventoryItemId" UUID,
  "warehouseId" UUID,
  "partName" TEXT NOT NULL,
  "unitCostSnapshot" NUMERIC(18,6),
  "unitPriceSnapshot" NUMERIC(14,2) NOT NULL,
  "grossAmountSnapshot" NUMERIC(14,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ServicePartCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServicePartCorrection_shop_number_key" UNIQUE ("shopId", "correctionNumber"),
  CONSTRAINT "ServicePartCorrection_shop_id_key" UNIQUE ("shopId", "id"),
  CONSTRAINT "ServicePartCorrection_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "ServicePartCorrection_cost_check" CHECK ("unitCostSnapshot" IS NULL OR "unitCostSnapshot" >= 0),
  CONSTRAINT "ServicePartCorrection_price_check" CHECK ("unitPriceSnapshot" >= 0),
  CONSTRAINT "ServicePartCorrection_gross_check" CHECK ("grossAmountSnapshot" >= 0),
  CONSTRAINT "ServicePartCorrection_reason_code_check" CHECK ("reasonCode" IN (
    'CUSTOMER_RETURN', 'DEFECTIVE', 'WARRANTY', 'REWORK', 'REPLACEMENT', 'OTHER'
  )),
  CONSTRAINT "ServicePartCorrection_disposition_check" CHECK ("inventoryDisposition" IN (
    'RETURN_TO_STOCK', 'NO_STOCK_CHANGE'
  )),
  CONSTRAINT "ServicePartCorrection_shopId_fkey" FOREIGN KEY ("shopId")
    REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServicePartCorrection_order_shop_fkey" FOREIGN KEY ("shopId", "serviceOrderId")
    REFERENCES "ServiceOrder"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "ServicePartCorrection_part_shop_fkey" FOREIGN KEY ("shopId", "servicePartLineId")
    REFERENCES "ServicePartLine"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "ServicePartCorrection_invoiceId_fkey" FOREIGN KEY ("invoiceId")
    REFERENCES "Invoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "ServicePartCorrection_creditNoteId_fkey" FOREIGN KEY ("creditNoteId")
    REFERENCES "InvoiceCreditNote"("id") ON DELETE RESTRICT,
  CONSTRAINT "ServicePartCorrection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServicePartCorrection_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId")
    REFERENCES "InventoryItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "ServicePartCorrection_warehouse_shop_fkey" FOREIGN KEY ("shopId", "warehouseId")
    REFERENCES "Warehouse"("shopId", "id") ON DELETE RESTRICT
);

CREATE INDEX "ServicePartCorrection_order_idx"
  ON "ServicePartCorrection" ("shopId", "serviceOrderId", "createdAt" DESC);
CREATE INDEX "ServicePartCorrection_part_idx"
  ON "ServicePartCorrection" ("shopId", "servicePartLineId", "createdAt" DESC);
CREATE INDEX "ServicePartCorrection_invoice_idx"
  ON "ServicePartCorrection" ("shopId", "invoiceId", "createdAt" DESC);
CREATE INDEX "ServicePartCorrection_credit_idx"
  ON "ServicePartCorrection" ("creditNoteId") WHERE "creditNoteId" IS NOT NULL;

ALTER TABLE "WarehouseMovement"
  ADD COLUMN "servicePartCorrectionId" UUID;

ALTER TABLE "WarehouseMovement"
  ADD CONSTRAINT "WarehouseMovement_service_part_correction_shop_fkey"
  FOREIGN KEY ("shopId", "servicePartCorrectionId")
  REFERENCES "ServicePartCorrection"("shopId", "id") ON DELETE RESTRICT;

ALTER TABLE "WarehouseMovement"
  ADD CONSTRAINT "WarehouseMovement_correction_type_check"
  CHECK ("servicePartCorrectionId" IS NULL OR "type" = 'SERVICE_RETURN');

CREATE UNIQUE INDEX "WarehouseMovement_service_part_correction_key"
  ON "WarehouseMovement" ("servicePartCorrectionId")
  WHERE "servicePartCorrectionId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "assertServicePartCorrectionIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_status TEXT;
  line_row RECORD;
  invoice_row RECORD;
  credit_row RECORD;
  used_quantity INTEGER;
  returned_quantity INTEGER;
BEGIN
  SELECT so."status"::text
  INTO order_status
  FROM "ServiceOrder" so
  WHERE so."shopId" = NEW."shopId"
    AND so."id" = NEW."serviceOrderId"
    AND so."deletedAt" IS NULL
  FOR UPDATE;

  IF order_status IS NULL THEN
    RAISE EXCEPTION 'أمر الصيانة المرتبط بالتصحيح غير موجود.';
  END IF;
  IF order_status NOT IN ('DELIVERED', 'CLOSED') THEN
    RAISE EXCEPTION 'تصحيح قطعة بعد التسليم متاح فقط لأمر صيانة تم تسليمه أو إغلاقه.';
  END IF;

  SELECT spl."id", spl."status"::text AS "status", spl."quantity",
         spl."inventoryItemId", spl."warehouseId", spl."partName",
         spl."unitCost", spl."unitPrice"
  INTO line_row
  FROM "ServicePartLine" spl
  WHERE spl."shopId" = NEW."shopId"
    AND spl."serviceOrderId" = NEW."serviceOrderId"
    AND spl."id" = NEW."servicePartLineId"
  FOR UPDATE;

  IF line_row."id" IS NULL THEN
    RAISE EXCEPTION 'بند قطعة الغيار لا ينتمي إلى أمر الصيانة المحدد.';
  END IF;
  IF line_row."status" <> 'USED' THEN
    RAISE EXCEPTION 'التصحيح بعد التسليم متاح فقط لقطعة تم استهلاكها فعلياً.';
  END IF;
  IF NEW."quantity" > line_row."quantity" THEN
    RAISE EXCEPTION 'كمية التصحيح لا يمكن أن تتجاوز كمية بند القطعة الأصلي.';
  END IF;

  IF NEW."inventoryItemId" IS DISTINCT FROM line_row."inventoryItemId"
     OR NEW."warehouseId" IS DISTINCT FROM line_row."warehouseId"
     OR NEW."partName" IS DISTINCT FROM line_row."partName"
     OR NEW."unitCostSnapshot" IS DISTINCT FROM line_row."unitCost"
     OR NEW."unitPriceSnapshot" IS DISTINCT FROM line_row."unitPrice" THEN
    RAISE EXCEPTION 'بيانات لقطة التصحيح لا تطابق بند قطعة الغيار الأصلي.';
  END IF;

  IF NEW."grossAmountSnapshot" <> round(NEW."unitPriceSnapshot" * NEW."quantity", 2) THEN
    RAISE EXCEPTION 'القيمة الإجمالية المحفوظة للتصحيح لا تطابق الكمية وسعر الوحدة.';
  END IF;

  SELECT i."id", i."serviceOrderId", i."status"::text AS "status"
  INTO invoice_row
  FROM "Invoice" i
  WHERE i."shopId" = NEW."shopId"
    AND i."id" = NEW."invoiceId"
    AND i."deletedAt" IS NULL
  FOR SHARE;

  IF invoice_row."id" IS NULL OR invoice_row."status" = 'VOID'
     OR invoice_row."serviceOrderId" IS DISTINCT FROM NEW."serviceOrderId" THEN
    RAISE EXCEPTION 'التصحيح يجب أن يرتبط بفاتورة صيانة فعالة لنفس أمر الصيانة.';
  END IF;

  IF NEW."creditNoteId" IS NOT NULL THEN
    SELECT cn."id", cn."invoiceId", cn."serviceOrderId"
    INTO credit_row
    FROM "InvoiceCreditNote" cn
    WHERE cn."shopId" = NEW."shopId"
      AND cn."id" = NEW."creditNoteId";

    IF credit_row."id" IS NULL
       OR credit_row."invoiceId" IS DISTINCT FROM NEW."invoiceId"
       OR credit_row."serviceOrderId" IS DISTINCT FROM NEW."serviceOrderId" THEN
      RAISE EXCEPTION 'الإشعار الدائن المحدد لا يخص نفس الفاتورة وأمر الصيانة.';
    END IF;
  END IF;

  IF NEW."inventoryDisposition" = 'RETURN_TO_STOCK' THEN
    IF line_row."inventoryItemId" IS NULL OR line_row."warehouseId" IS NULL THEN
      RAISE EXCEPTION 'لا يمكن إعادة قطعة يدوية أو غير مرتبطة بمستودع إلى المخزون.';
    END IF;

    SELECT COALESCE(SUM(-wm."quantityChange"), 0)::integer
    INTO used_quantity
    FROM "WarehouseMovement" wm
    WHERE wm."shopId" = NEW."shopId"
      AND wm."serviceOrderId" = NEW."serviceOrderId"
      AND wm."servicePartLineId" = NEW."servicePartLineId"
      AND wm."inventoryItemId" = line_row."inventoryItemId"
      AND wm."warehouseId" = line_row."warehouseId"
      AND wm."type" = 'SERVICE_USAGE'
      AND wm."quantityChange" < 0;

    SELECT COALESCE(SUM(wm."quantityChange"), 0)::integer
    INTO returned_quantity
    FROM "WarehouseMovement" wm
    WHERE wm."shopId" = NEW."shopId"
      AND wm."serviceOrderId" = NEW."serviceOrderId"
      AND wm."servicePartLineId" = NEW."servicePartLineId"
      AND wm."inventoryItemId" = line_row."inventoryItemId"
      AND wm."warehouseId" = line_row."warehouseId"
      AND wm."type" = 'SERVICE_RETURN'
      AND wm."quantityChange" > 0;

    IF used_quantity <= 0 THEN
      RAISE EXCEPTION 'تعذر إثبات حركة الاستهلاك الأصلية لهذه القطعة.';
    END IF;
    IF NEW."quantity" > (used_quantity - returned_quantity) THEN
      RAISE EXCEPTION 'كمية الإرجاع للمخزون تتجاوز الكمية المستهلكة المتبقية القابلة للإرجاع.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ServicePartCorrection_integrity_guard"
BEFORE INSERT ON "ServicePartCorrection"
FOR EACH ROW
EXECUTE FUNCTION "assertServicePartCorrectionIntegrity"();

CREATE OR REPLACE FUNCTION "preventServicePartCorrectionMutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'سجل تصحيح قطعة ما بعد التسليم غير قابل للتعديل أو الحذف. أنشئ سجلاً تصحيحياً جديداً عند الحاجة.';
END;
$$;

CREATE TRIGGER "ServicePartCorrection_immutable"
BEFORE UPDATE OR DELETE ON "ServicePartCorrection"
FOR EACH ROW
EXECUTE FUNCTION "preventServicePartCorrectionMutation"();

ALTER TABLE "ServicePartCorrection" ENABLE ROW LEVEL SECURITY;
