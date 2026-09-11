CREATE OR REPLACE FUNCTION "assertServiceOrderAssignedTechnician"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."assignedToUserId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."assignedToUserId" IS NOT DISTINCT FROM OLD."assignedToUserId"
     AND NEW."shopId" IS NOT DISTINCT FROM OLD."shopId" THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Membership" m
    JOIN "User" u
      ON u."id" = m."userId"
     AND u."deletedAt" IS NULL
    WHERE m."shopId" = NEW."shopId"
      AND m."userId" = NEW."assignedToUserId"
      AND m."deletedAt" IS NULL
      AND m."status"::text = 'ACTIVE'
      AND m."role"::text = 'TECHNICIAN'
  ) THEN
    RAISE EXCEPTION 'assignedToUserId must reference an active TECHNICIAN membership in the same shop'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceOrder_require_active_technician" ON "ServiceOrder";
CREATE TRIGGER "ServiceOrder_require_active_technician"
BEFORE INSERT OR UPDATE OF "assignedToUserId", "shopId"
ON "ServiceOrder"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceOrderAssignedTechnician"();

CREATE OR REPLACE FUNCTION "assertServiceLaborLineTechnician"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."technicianUserId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."technicianUserId" IS NOT DISTINCT FROM OLD."technicianUserId"
     AND NEW."shopId" IS NOT DISTINCT FROM OLD."shopId" THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Membership" m
    JOIN "User" u
      ON u."id" = m."userId"
     AND u."deletedAt" IS NULL
    WHERE m."shopId" = NEW."shopId"
      AND m."userId" = NEW."technicianUserId"
      AND m."deletedAt" IS NULL
      AND m."status"::text = 'ACTIVE'
      AND m."role"::text = 'TECHNICIAN'
  ) THEN
    RAISE EXCEPTION 'technicianUserId must reference an active TECHNICIAN membership in the same shop'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceLaborLine_require_active_technician" ON "ServiceLaborLine";
CREATE TRIGGER "ServiceLaborLine_require_active_technician"
BEFORE INSERT OR UPDATE OF "technicianUserId", "shopId"
ON "ServiceLaborLine"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceLaborLineTechnician"();
