-- Massar Auto: automotive service core.
-- Additive migration only. Legacy phone-repair tables are intentionally left untouched
-- until the automotive code path is fully migrated and verified.

CREATE TABLE "Vehicle" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "customerId" uuid NOT NULL,
  "plateNumber" text,
  "vin" text,
  "make" text NOT NULL,
  "model" text NOT NULL,
  "year" integer,
  "color" text,
  "engineNumber" text,
  "fuelType" varchar(24),
  "transmission" varchar(24),
  "engineDetails" text,
  "currentOdometer" integer,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "Vehicle_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT,
  CONSTRAINT "Vehicle_year_check" CHECK ("year" IS NULL OR ("year" >= 1886 AND "year" <= 2200)),
  CONSTRAINT "Vehicle_odometer_check" CHECK ("currentOdometer" IS NULL OR "currentOdometer" >= 0),
  CONSTRAINT "Vehicle_shop_id_key" UNIQUE ("shopId", "id")
);

CREATE UNIQUE INDEX "Vehicle_shop_plate_active_key"
  ON "Vehicle" ("shopId", lower(btrim("plateNumber")))
  WHERE "plateNumber" IS NOT NULL AND btrim("plateNumber") <> '' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Vehicle_shop_vin_active_key"
  ON "Vehicle" ("shopId", upper(btrim("vin")))
  WHERE "vin" IS NOT NULL AND btrim("vin") <> '' AND "deletedAt" IS NULL;
CREATE INDEX "Vehicle_shop_customer_idx" ON "Vehicle" ("shopId", "customerId", "createdAt" DESC);
CREATE INDEX "Vehicle_shop_make_model_idx" ON "Vehicle" ("shopId", "make", "model");
CREATE INDEX "Vehicle_shop_deleted_idx" ON "Vehicle" ("shopId", "deletedAt");

CREATE TABLE "ServiceOrder" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "vehicleId" uuid NOT NULL,
  "customerId" uuid NOT NULL,
  "orderNumber" text NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'RECEIVED',
  "reportedIssue" text NOT NULL,
  "receptionNotes" text,
  "exteriorCondition" text,
  "keysAndItems" text,
  "diagnosis" text,
  "resolutionNotes" text,
  "odometerAtIntake" integer,
  "fuelLevelPercent" numeric(5,2),
  "estimatedTotal" numeric(14,2),
  "finalTotal" numeric(14,2),
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "promisedAt" timestamptz,
  "approvedAt" timestamptz,
  "startedAt" timestamptz,
  "readyAt" timestamptz,
  "deliveredAt" timestamptz,
  "closedAt" timestamptz,
  "receptionistUserId" uuid,
  "assignedToUserId" uuid,
  "createdByUserId" uuid,
  "updatedByUserId" uuid,
  "clientGeneratedId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "ServiceOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceOrder_vehicle_shop_fkey" FOREIGN KEY ("shopId", "vehicleId") REFERENCES "Vehicle"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceOrder_receptionistUserId_fkey" FOREIGN KEY ("receptionistUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceOrder_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceOrder_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceOrder_status_check" CHECK ("status" IN (
    'RECEIVED','INSPECTING','WAITING_CUSTOMER_APPROVAL','APPROVED','IN_SERVICE',
    'WAITING_PARTS','READY_FOR_DELIVERY','DELIVERED','CLOSED','REJECTED','CANCELLED'
  )),
  CONSTRAINT "ServiceOrder_odometer_check" CHECK ("odometerAtIntake" IS NULL OR "odometerAtIntake" >= 0),
  CONSTRAINT "ServiceOrder_fuel_check" CHECK ("fuelLevelPercent" IS NULL OR ("fuelLevelPercent" >= 0 AND "fuelLevelPercent" <= 100)),
  CONSTRAINT "ServiceOrder_estimated_total_check" CHECK ("estimatedTotal" IS NULL OR "estimatedTotal" >= 0),
  CONSTRAINT "ServiceOrder_final_total_check" CHECK ("finalTotal" IS NULL OR "finalTotal" >= 0),
  CONSTRAINT "ServiceOrder_shop_order_number_key" UNIQUE ("shopId", "orderNumber"),
  CONSTRAINT "ServiceOrder_shop_id_key" UNIQUE ("shopId", "id")
);

CREATE UNIQUE INDEX "ServiceOrder_shop_client_generated_key"
  ON "ServiceOrder" ("shopId", "clientGeneratedId")
  WHERE "clientGeneratedId" IS NOT NULL;
CREATE INDEX "ServiceOrder_shop_status_idx" ON "ServiceOrder" ("shopId", "status", "receivedAt" DESC);
CREATE INDEX "ServiceOrder_shop_vehicle_idx" ON "ServiceOrder" ("shopId", "vehicleId", "receivedAt" DESC);
CREATE INDEX "ServiceOrder_shop_customer_idx" ON "ServiceOrder" ("shopId", "customerId", "receivedAt" DESC);
CREATE INDEX "ServiceOrder_shop_assignee_idx" ON "ServiceOrder" ("shopId", "assignedToUserId", "status");
CREATE INDEX "ServiceOrder_shop_promised_idx" ON "ServiceOrder" ("shopId", "promisedAt") WHERE "promisedAt" IS NOT NULL;
CREATE INDEX "ServiceOrder_shop_deleted_idx" ON "ServiceOrder" ("shopId", "deletedAt");

CREATE TABLE "ServiceOrderStatusHistory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "serviceOrderId" uuid NOT NULL,
  "fromStatus" varchar(40),
  "toStatus" varchar(40) NOT NULL,
  "note" text,
  "createdByUserId" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ServiceOrderStatusHistory_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceOrderStatusHistory_order_shop_fkey" FOREIGN KEY ("shopId", "serviceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "ServiceOrderStatusHistory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceOrderStatusHistory_from_status_check" CHECK ("fromStatus" IS NULL OR "fromStatus" IN (
    'RECEIVED','INSPECTING','WAITING_CUSTOMER_APPROVAL','APPROVED','IN_SERVICE',
    'WAITING_PARTS','READY_FOR_DELIVERY','DELIVERED','CLOSED','REJECTED','CANCELLED'
  )),
  CONSTRAINT "ServiceOrderStatusHistory_to_status_check" CHECK ("toStatus" IN (
    'RECEIVED','INSPECTING','WAITING_CUSTOMER_APPROVAL','APPROVED','IN_SERVICE',
    'WAITING_PARTS','READY_FOR_DELIVERY','DELIVERED','CLOSED','REJECTED','CANCELLED'
  ))
);
CREATE INDEX "ServiceOrderStatusHistory_order_idx" ON "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "createdAt");

CREATE TABLE "ServiceInspection" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "serviceOrderId" uuid NOT NULL,
  "inspectionType" varchar(16) NOT NULL DEFAULT 'INITIAL',
  "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
  "summary" text,
  "inspectorUserId" uuid,
  "inspectedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ServiceInspection_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceInspection_order_shop_fkey" FOREIGN KEY ("shopId", "serviceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "ServiceInspection_inspectorUserId_fkey" FOREIGN KEY ("inspectorUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceInspection_type_check" CHECK ("inspectionType" IN ('INITIAL','FINAL','OTHER')),
  CONSTRAINT "ServiceInspection_status_check" CHECK ("status" IN ('DRAFT','COMPLETED','CANCELLED')),
  CONSTRAINT "ServiceInspection_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "ServiceInspection_order_idx" ON "ServiceInspection" ("shopId", "serviceOrderId", "createdAt" DESC);

CREATE TABLE "ServiceInspectionItem" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "inspectionId" uuid NOT NULL,
  "component" text NOT NULL,
  "result" varchar(16) NOT NULL DEFAULT 'NOT_CHECKED',
  "notes" text,
  "recommendedAction" text,
  "estimatedCost" numeric(14,2),
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ServiceInspectionItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceInspectionItem_inspection_shop_fkey" FOREIGN KEY ("shopId", "inspectionId") REFERENCES "ServiceInspection"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "ServiceInspectionItem_result_check" CHECK ("result" IN ('OK','WARNING','FAIL','NOT_CHECKED')),
  CONSTRAINT "ServiceInspectionItem_estimated_cost_check" CHECK ("estimatedCost" IS NULL OR "estimatedCost" >= 0)
);
CREATE INDEX "ServiceInspectionItem_inspection_idx" ON "ServiceInspectionItem" ("shopId", "inspectionId", "sortOrder");

CREATE TABLE "ServiceLaborLine" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "serviceOrderId" uuid NOT NULL,
  "description" text NOT NULL,
  "technicianUserId" uuid,
  "hours" numeric(8,2),
  "quantity" numeric(10,2) NOT NULL DEFAULT 1,
  "unitPrice" numeric(14,2) NOT NULL DEFAULT 0,
  "costAmount" numeric(14,2),
  "lineTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "status" varchar(16) NOT NULL DEFAULT 'PLANNED',
  "notes" text,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ServiceLaborLine_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceLaborLine_order_shop_fkey" FOREIGN KEY ("shopId", "serviceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "ServiceLaborLine_technicianUserId_fkey" FOREIGN KEY ("technicianUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceLaborLine_hours_check" CHECK ("hours" IS NULL OR "hours" >= 0),
  CONSTRAINT "ServiceLaborLine_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "ServiceLaborLine_unit_price_check" CHECK ("unitPrice" >= 0),
  CONSTRAINT "ServiceLaborLine_cost_check" CHECK ("costAmount" IS NULL OR "costAmount" >= 0),
  CONSTRAINT "ServiceLaborLine_total_check" CHECK ("lineTotal" >= 0),
  CONSTRAINT "ServiceLaborLine_status_check" CHECK ("status" IN ('PLANNED','APPROVED','IN_PROGRESS','DONE','CANCELLED')),
  CONSTRAINT "ServiceLaborLine_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "ServiceLaborLine_order_idx" ON "ServiceLaborLine" ("shopId", "serviceOrderId", "sortOrder");
CREATE INDEX "ServiceLaborLine_technician_idx" ON "ServiceLaborLine" ("shopId", "technicianUserId", "status");

CREATE TABLE "ServicePartLine" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "serviceOrderId" uuid NOT NULL,
  "inventoryItemId" uuid,
  "partName" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unitCost" numeric(18,6),
  "unitPrice" numeric(14,2) NOT NULL DEFAULT 0,
  "lineTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "status" varchar(16) NOT NULL DEFAULT 'PLANNED',
  "notes" text,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ServicePartLine_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServicePartLine_order_shop_fkey" FOREIGN KEY ("shopId", "serviceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "ServicePartLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL,
  CONSTRAINT "ServicePartLine_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "ServicePartLine_unit_cost_check" CHECK ("unitCost" IS NULL OR "unitCost" >= 0),
  CONSTRAINT "ServicePartLine_unit_price_check" CHECK ("unitPrice" >= 0),
  CONSTRAINT "ServicePartLine_total_check" CHECK ("lineTotal" >= 0),
  CONSTRAINT "ServicePartLine_status_check" CHECK ("status" IN ('PLANNED','APPROVED','RESERVED','USED','RETURNED','CANCELLED')),
  CONSTRAINT "ServicePartLine_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "ServicePartLine_order_idx" ON "ServicePartLine" ("shopId", "serviceOrderId", "sortOrder");
CREATE INDEX "ServicePartLine_inventory_idx" ON "ServicePartLine" ("shopId", "inventoryItemId");

CREATE TABLE "Quotation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "serviceOrderId" uuid NOT NULL,
  "quoteNumber" text NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "status" varchar(24) NOT NULL DEFAULT 'DRAFT',
  "subtotal" numeric(14,2) NOT NULL DEFAULT 0,
  "discountTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "taxTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "total" numeric(14,2) NOT NULL DEFAULT 0,
  "validUntil" timestamptz,
  "notes" text,
  "sentAt" timestamptz,
  "createdByUserId" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Quotation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "Quotation_order_shop_fkey" FOREIGN KEY ("shopId", "serviceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "Quotation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "Quotation_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "Quotation_status_check" CHECK ("status" IN ('DRAFT','SENT','APPROVED','PARTIALLY_APPROVED','REJECTED','EXPIRED','SUPERSEDED')),
  CONSTRAINT "Quotation_amounts_check" CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0),
  CONSTRAINT "Quotation_shop_quote_number_key" UNIQUE ("shopId", "quoteNumber"),
  CONSTRAINT "Quotation_order_revision_key" UNIQUE ("serviceOrderId", "revision"),
  CONSTRAINT "Quotation_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "Quotation_order_idx" ON "Quotation" ("shopId", "serviceOrderId", "revision" DESC);
CREATE INDEX "Quotation_status_idx" ON "Quotation" ("shopId", "status", "createdAt" DESC);

CREATE TABLE "QuotationLine" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "quotationId" uuid NOT NULL,
  "lineType" varchar(12) NOT NULL,
  "description" text NOT NULL,
  "inventoryItemId" uuid,
  "serviceLaborLineId" uuid,
  "servicePartLineId" uuid,
  "quantity" numeric(12,2) NOT NULL DEFAULT 1,
  "unitCost" numeric(18,6),
  "unitPrice" numeric(14,2) NOT NULL DEFAULT 0,
  "discountTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "lineTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "approvalStatus" varchar(12) NOT NULL DEFAULT 'PENDING',
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "QuotationLine_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "QuotationLine_quote_shop_fkey" FOREIGN KEY ("shopId", "quotationId") REFERENCES "Quotation"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "QuotationLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL,
  CONSTRAINT "QuotationLine_labor_shop_fkey" FOREIGN KEY ("shopId", "serviceLaborLineId") REFERENCES "ServiceLaborLine"("shopId", "id") ON DELETE SET NULL,
  CONSTRAINT "QuotationLine_part_shop_fkey" FOREIGN KEY ("shopId", "servicePartLineId") REFERENCES "ServicePartLine"("shopId", "id") ON DELETE SET NULL,
  CONSTRAINT "QuotationLine_type_check" CHECK ("lineType" IN ('LABOR','PART','OTHER')),
  CONSTRAINT "QuotationLine_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "QuotationLine_amounts_check" CHECK (("unitCost" IS NULL OR "unitCost" >= 0) AND "unitPrice" >= 0 AND "discountTotal" >= 0 AND "lineTotal" >= 0),
  CONSTRAINT "QuotationLine_approval_check" CHECK ("approvalStatus" IN ('PENDING','APPROVED','REJECTED'))
);
CREATE INDEX "QuotationLine_quote_idx" ON "QuotationLine" ("shopId", "quotationId", "sortOrder");

CREATE TABLE "CustomerApproval" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "serviceOrderId" uuid NOT NULL,
  "quotationId" uuid NOT NULL,
  "decision" varchar(24) NOT NULL,
  "channel" varchar(16) NOT NULL DEFAULT 'IN_PERSON',
  "customerNameSnapshot" text,
  "customerPhoneSnapshot" text,
  "note" text,
  "decidedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedByUserId" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CustomerApproval_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "CustomerApproval_order_shop_fkey" FOREIGN KEY ("shopId", "serviceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "CustomerApproval_quote_shop_fkey" FOREIGN KEY ("shopId", "quotationId") REFERENCES "Quotation"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "CustomerApproval_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "CustomerApproval_decision_check" CHECK ("decision" IN ('APPROVED','PARTIALLY_APPROVED','REJECTED')),
  CONSTRAINT "CustomerApproval_channel_check" CHECK ("channel" IN ('IN_PERSON','PHONE','WHATSAPP','WEB','OTHER'))
);
CREATE INDEX "CustomerApproval_quote_idx" ON "CustomerApproval" ("shopId", "quotationId", "decidedAt" DESC);
CREATE INDEX "CustomerApproval_order_idx" ON "CustomerApproval" ("shopId", "serviceOrderId", "decidedAt" DESC);
