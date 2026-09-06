import assert from "node:assert/strict";
import {
  autoDetectColumnMapping,
  buildImportedPurchaseRows,
  detectHeaderRow,
  isLikelyScannerSequence,
  normalizeArabicDigits,
  parseFlexibleNumber,
  parsePastedTable,
  pricingSuggestion,
  resolveImportedMatch,
  suggestedCompatibilityDataset,
} from "../lib/purchase-import";

const header = "اسم الصنف\tالباركود\tالكمية\tتكلفة الوحدة\tسعر البيع";
const data = Array.from({ length: 20 }, (_, index) =>
  `شاشة A${index + 1} أصلية\t${1000000000000 + index}\t${index === 3 ? "٢" : "2"}\t${index === 4 ? "١٤٫٥" : "14.5"}\t22`,
).join("\n");
const parsed = parsePastedTable(`${header}\n${data}`);
assert.equal(parsed.rows.length, 21);
assert.equal(parsed.delimiter, "tab");
assert.equal(detectHeaderRow(parsed.rows), true);
const mapping = autoDetectColumnMapping(parsed.rows, true);
assert.equal(mapping.name, 0);
const rows = buildImportedPurchaseRows(parsed.rows, mapping, { headerRow: true });
assert.equal(rows.length, 20);
assert.equal(rows.filter((row) => row.errors.length > 0).length, 0);
assert.equal(rows[3].quantity, "2");
assert.equal(rows[4].unitCost, "14.5");
assert.equal(rows.filter((row) => /[\u0600-\u06FF]/.test(row.name)).length, 20);

const incompleteTable = parsePastedTable(`${header}\nشاشة ناقصة\t999\t\t\t25`);
const incomplete = buildImportedPurchaseRows(incompleteTable.rows, autoDetectColumnMapping(incompleteTable.rows, true), { headerRow: true });
assert.ok(incomplete[0].errors.length > 0);

const ambiguous = parseFlexibleNumber("1,234", { required: true });
assert.equal(ambiguous.ambiguous, true);
assert.deepEqual(new Set(ambiguous.candidates), new Set([1.234, 1234]));
assert.ok(ambiguous.warning);
assert.equal(parseFlexibleNumber("١٬٢٣٤٫٥٠", { required: true }).value, 1234.5);
assert.equal(normalizeArabicDigits("١٢٣۴۵"), "12345");

const duplicateTable = parsePastedTable(`${header}\nشاشة A52 Original\t777\t1\t10\t20\nشاشة A52 Copy\t777\t1\t8\t16`);
const duplicateRows = buildImportedPurchaseRows(duplicateTable.rows, autoDetectColumnMapping(duplicateTable.rows, true), { headerRow: true });
assert.ok(duplicateRows[1].warnings.some((warning) => warning.includes("لن يتم دمج")));
assert.notEqual(duplicateRows[0].name, duplicateRows[1].name);

const inventory = [
  { id: "1", name: "شاشة A52 Original أسود", barcode: "777", sku: "A52-O-B", category: "شاشات", description: "Original Black" },
  { id: "2", name: "شاشة A52 Copy أسود", barcode: "888", sku: "A52-C-B", category: "شاشات", description: "Copy Black" },
];
const exact = resolveImportedMatch({ barcode: "777", name: inventory[0].name, exactBarcode: [inventory[0]], exactSku: [], nameCandidates: inventory });
assert.equal(exact.state, "existing");
assert.equal(exact.reason, "barcode");
const nameOnly = resolveImportedMatch({ name: inventory[0].name, exactBarcode: [], exactSku: [], nameCandidates: inventory });
assert.equal(nameOnly.state, "review");
const qualityVariant = resolveImportedMatch({ name: inventory[1].name, exactBarcode: [], exactSku: [], nameCandidates: inventory });
assert.equal(qualityVariant.state, "review");

assert.equal(pricingSuggestion(100, 30, "none"), 130);
assert.equal(pricingSuggestion(99, 30, "5"), 130);
assert.equal(pricingSuggestion(10, 25, "0.5"), 12.5);
assert.equal(isLikelyScannerSequence([0, 20, 39, 61, 80, 100], 4), true);
assert.equal(isLikelyScannerSequence([0, 250, 600, 1000, 1500], 4), false);
assert.equal(suggestedCompatibilityDataset("بطارية Samsung A52"), "BATTERY");
assert.equal(suggestedCompatibilityDataset("شاشة iPhone 11"), "SCREEN");

console.log("purchase-import tests: PASS", {
  rows: rows.length,
  arabicNames: rows.filter((row) => /[\u0600-\u06FF]/.test(row.name)).length,
  ambiguousCandidates: ambiguous.candidates,
  duplicateWarning: duplicateRows[1].warnings[0],
  exactBarcode: exact.state,
  nameOnly: nameOnly.state,
  bulkPrice: pricingSuggestion(100, 30, "none"),
});
