-- Pin search_path for Massar Auto trigger functions so object resolution cannot
-- be influenced by a caller-controlled or role-level search_path. These are
-- SECURITY INVOKER functions; this migration changes only name resolution.

ALTER FUNCTION public."assertServiceOrderDeliveryCloseAudit"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServiceOrderLinesNotInvoiced"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServiceOrderAssignedTechnician"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServiceLaborLineTechnician"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertInvoiceCreditNoteIntegrity"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertInvoiceCreditRefundIntegrity"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."preventInvoiceCreditLedgerMutation"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertAutoInvoiceServiceOrderStatus"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServiceOrderInvoiceCompatibleStatus"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertQuotationWorkflowStage"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServicePartCorrectionIntegrity"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."preventServicePartCorrectionMutation"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServiceWarrantyClaimIntegrity"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."protectServiceWarrantyClaimIdentity"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."preventServiceWarrantyClaimDelete"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."preventServiceWarrantyClaimHistoryMutation"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServiceWarrantyClaimStateConsistency"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServiceWarrantyClaimHistoryIntegrity"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertCoveredWarrantyInvoiceIntegrity"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."assertServiceWarrantyClaimBillingDecisionIntegrity"() SET search_path = pg_catalog, public;
ALTER FUNCTION public."guard_supplier_return_duplicate_inventory_item"() SET search_path = pg_catalog, public;
