import { MembershipRole } from "@prisma/client";

/**
 * Typed application-wide permissions.
 *
 * During the automotive transition we keep the legacy Massar permissions so the
 * cloned application continues to compile while new vehicle/workshop routes are
 * moved to the dedicated permission set below.
 */
export type AppPermission =
  | "repairs:read"
  | "repairs:create"
  | "repairs:update"
  | "repairs:update_status"
  | "repairs:assign"
  | "repairs:delete"
  | "vehicles:read"
  | "vehicles:manage"
  | "vehicles:delete"
  | "service_orders:read"
  | "service_orders:create"
  | "service_orders:update"
  | "service_orders:update_status"
  | "service_orders:assign"
  | "service_orders:delete"
  | "quotes:read"
  | "quotes:manage"
  | "sales:read"
  | "sales:create"
  | "sales:cancel"
  | "sales:return"
  | "electronic_services:read"
  | "electronic_services:execute"
  | "electronic_services:manage"
  | "inventory:read"
  | "inventory:use_parts"
  | "inventory:manage"
  | "inventory:adjust"
  | "warehouse:read"
  | "warehouse:manage"
  | "warehouse:transfer"
  | "warehouse:stocktake"
  | "invoices:read"
  | "invoices:pay"
  | "invoices:void"
  | "invoices:credit"
  | "customers:manage"
  | "customers:delete"
  | "suppliers:manage"
  | "reports:read"
  | "expenses:manage"
  | "debts:manage"
  | "finance:vouchers"
  | "cash:close"
  | "cash:reopen"
  | "shop:settings"
  | "team:read"
  | "team:invite"
  | "team:manage"
  | "subscription:manage";

export const ALL_APP_PERMISSIONS: readonly AppPermission[] = [
  "repairs:read",
  "repairs:create",
  "repairs:update",
  "repairs:update_status",
  "repairs:assign",
  "repairs:delete",
  "vehicles:read",
  "vehicles:manage",
  "vehicles:delete",
  "service_orders:read",
  "service_orders:create",
  "service_orders:update",
  "service_orders:update_status",
  "service_orders:assign",
  "service_orders:delete",
  "quotes:read",
  "quotes:manage",
  "sales:read",
  "sales:create",
  "sales:cancel",
  "sales:return",
  "electronic_services:read",
  "electronic_services:execute",
  "electronic_services:manage",
  "inventory:read",
  "inventory:use_parts",
  "inventory:manage",
  "inventory:adjust",
  "warehouse:read",
  "warehouse:manage",
  "warehouse:transfer",
  "warehouse:stocktake",
  "invoices:read",
  "invoices:pay",
  "invoices:void",
  "invoices:credit",
  "customers:manage",
  "customers:delete",
  "suppliers:manage",
  "reports:read",
  "expenses:manage",
  "debts:manage",
  "finance:vouchers",
  "cash:close",
  "cash:reopen",
  "shop:settings",
  "team:read",
  "team:invite",
  "team:manage",
  "subscription:manage",
] as const;

/**
 * Automotive role presets. ADMIN acts as the workshop/branch manager while
 * RECEPTIONIST, TECHNICIAN, WAREHOUSE and FINANCE are least-privilege presets.
 */
export const ROLE_PERMISSIONS_MATRIX: Record<MembershipRole, readonly AppPermission[]> = {
  OWNER: ALL_APP_PERMISSIONS,

  ADMIN: [
    "repairs:read",
    "repairs:create",
    "repairs:update",
    "repairs:update_status",
    "repairs:assign",
    "repairs:delete",
    "vehicles:read",
    "vehicles:manage",
    "vehicles:delete",
    "service_orders:read",
    "service_orders:create",
    "service_orders:update",
    "service_orders:update_status",
    "service_orders:assign",
    "service_orders:delete",
    "quotes:read",
    "quotes:manage",
    "sales:read",
    "sales:create",
    "sales:cancel",
    "sales:return",
    "electronic_services:read",
    "electronic_services:execute",
    "electronic_services:manage",
    "inventory:read",
    "inventory:use_parts",
    "inventory:manage",
    "inventory:adjust",
    "warehouse:read",
    "warehouse:manage",
    "warehouse:transfer",
    "warehouse:stocktake",
    "invoices:read",
    "invoices:pay",
    "invoices:void",
    "invoices:credit",
    "customers:manage",
    "customers:delete",
    "suppliers:manage",
    "reports:read",
    "expenses:manage",
    "debts:manage",
    "finance:vouchers",
    "cash:close",
    "cash:reopen",
    "team:read",
    "team:invite",
    "team:manage",
    // shop:settings and subscription:manage remain OWNER-only.
  ],

  TECHNICIAN: [
    "repairs:read",
    "repairs:create",
    "repairs:update",
    "repairs:update_status",
    "vehicles:read",
    "service_orders:read",
    "service_orders:create",
    "service_orders:update",
    "service_orders:update_status",
    "quotes:read",
    "sales:read",
    "sales:create",
    "electronic_services:read",
    "electronic_services:execute",
    "inventory:read",
    "inventory:use_parts",
    "warehouse:read",
    "invoices:read",
    "invoices:pay",
    "customers:manage",
    "team:read",
  ],

  RECEPTIONIST: [
    "repairs:read",
    "repairs:create",
    "repairs:update",
    "repairs:update_status",
    "vehicles:read",
    "vehicles:manage",
    "service_orders:read",
    "service_orders:create",
    "service_orders:update",
    "service_orders:update_status",
    "quotes:read",
    "quotes:manage",
    "sales:read",
    "sales:create",
    "inventory:read",
    "inventory:use_parts",
    "warehouse:read",
    "invoices:read",
    "invoices:pay",
    "customers:manage",
    "reports:read",
    "team:read",
  ],

  WAREHOUSE: [
    "sales:read",
    "inventory:read",
    "inventory:use_parts",
    "inventory:manage",
    "inventory:adjust",
    "warehouse:read",
    "warehouse:manage",
    "warehouse:transfer",
    "warehouse:stocktake",
    "suppliers:manage",
    "reports:read",
    "team:read",
  ],

  FINANCE: [
    "sales:read",
    "sales:create",
    "sales:cancel",
    "sales:return",
    "invoices:read",
    "invoices:pay",
    "invoices:void",
    "invoices:credit",
    "customers:manage",
    "suppliers:manage",
    "reports:read",
    "expenses:manage",
    "debts:manage",
    "finance:vouchers",
    "cash:close",
    "team:read",
  ],

  VIEWER: [
    "repairs:read",
    "vehicles:read",
    "service_orders:read",
    "quotes:read",
    "sales:read",
    "electronic_services:read",
    "inventory:read",
    "warehouse:read",
    "invoices:read",
    "reports:read",
    "team:read",
  ],
};

export function getPermissionsForRole(role: MembershipRole): AppPermission[] {
  const permissions = ROLE_PERMISSIONS_MATRIX[role];
  return permissions ? [...permissions] : [];
}

export function hasRolePermission(role: MembershipRole, permission: AppPermission): boolean {
  const permissions = ROLE_PERMISSIONS_MATRIX[role];
  return permissions ? permissions.includes(permission) : false;
}
