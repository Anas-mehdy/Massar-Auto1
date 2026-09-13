const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requestedGroup = process.argv[2] || "all";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(relativePath, expected, message) {
  const content = read(relativePath);
  assert(content.includes(expected), message ?? `${relativePath} must include ${expected}`);
}

function assertExcludes(relativePath, forbidden, message) {
  const content = read(relativePath);
  assert(!content.includes(forbidden), message ?? `${relativePath} must not include ${forbidden}`);
}

function runRoutesChecks() {
  const retiredCompatibilityApis = [
    "app/api/compatibility/devices/route.ts",
    "app/api/compatibility/directory/route.ts",
    "app/api/compatibility/inventory/route.ts",
    "app/api/compatibility/search/route.ts",
  ];

  assertIncludes(
    "app/repair-orders/layout.tsx",
    'redirect("/service-orders")',
    "Legacy phone repair routes must remain unreachable in Massar Auto.",
  );

  assertIncludes(
    "app/compatibility/page.tsx",
    'redirect("/inventory")',
    "Phone compatibility workspace must remain retired in Massar Auto.",
  );

  for (const file of retiredCompatibilityApis) {
    assertIncludes(file, "FEATURE_RETIRED", `${file} must stay retired.`);
    assertIncludes(file, "status: 410", `${file} must return HTTP 410.`);
  }

  console.log("Massar Auto route retirement checks passed.");
}

function runInventoryChecks() {
  assertExcludes(
    "app/inventory/actions.ts",
    "compatibilityGroupIds",
    "Inventory actions must not accept phone compatibility identifiers.",
  );
  assertExcludes(
    "lib/services/inventoryService.ts",
    "inventoryCompatibilityGroup",
    "Inventory service must not create phone compatibility links.",
  );
  assertExcludes(
    "lib/services/inventoryService.ts",
    "CompatibilityCandidate",
    "Inventory service must not depend on phone compatibility candidates.",
  );

  console.log("Massar Auto inventory boundary checks passed.");
}

function runContentChecks() {
  assertExcludes(
    "components/dashboard/dashboard-kpi-navigation.tsx",
    "/repair-orders",
    "Dashboard navigation must never send automotive users to legacy repair orders.",
  );
  assertExcludes(
    "app/dashboard/page.tsx",
    "/repair-orders",
    "Dashboard must not link automotive users to legacy repair orders.",
  );
  assertExcludes(
    "lib/help/catalog.ts",
    "/repair-orders",
    "Help content must not link to legacy phone repair routes.",
  );
  assertExcludes(
    "lib/help/catalog.ts",
    "IMEI",
    "Help content must not expose phone-repair IMEI guidance in Massar Auto.",
  );
  assertExcludes(
    "app/point-of-sale/page.tsx",
    'key: "software"',
    "Automotive POS must not expose the phone-era software service tab.",
  );
  assertExcludes(
    "app/point-of-sale/page.tsx",
    'key: "electronic"',
    "Automotive POS must not expose the phone-era electronic service tab.",
  );
  assertExcludes(
    "components/quick-operations.tsx",
    'tab=software',
    "Quick operations must not expose phone-era software services.",
  );
  assertExcludes(
    "components/quick-operations.tsx",
    'tab=electronic',
    "Quick operations must not expose phone-era electronic services.",
  );

  console.log("Massar Auto user-facing content checks passed.");
}

const groups = {
  routes: runRoutesChecks,
  inventory: runInventoryChecks,
  content: runContentChecks,
};

if (requestedGroup === "all") {
  Object.values(groups).forEach((run) => run());
  console.log("Massar Auto static boundary checks passed.");
} else {
  const run = groups[requestedGroup];
  if (!run) throw new Error(`Unknown static test group: ${requestedGroup}`);
  run();
}
