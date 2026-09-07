import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  compareExtractedTotals,
  extractPurchaseFromPastedText,
  isPurchaseExtractedItemIncomplete,
  purchaseExtractedDocumentSchema,
  validatePurchaseImportFile,
} from "../lib/purchase-document-import";
import { resolveImportedMatch } from "../lib/purchase-import";

async function main() {
const clearText = `
المورد: أحمد موبايل
رقم الفاتورة: INV-125
التاريخ: 06/09/2026
شاشة Samsung A10 | 2 | 10.50
بطارية A12 qty: 3 cost: 7
خصم: 2
شحن: 5
الإجمالي النهائي: 45
`.trim();
const clear = purchaseExtractedDocumentSchema.parse(extractPurchaseFromPastedText(clearText));
assert.equal(clear.supplierName, "أحمد موبايل");
assert.equal(clear.supplierInvoiceNumber, "INV-125");
assert.equal(clear.invoiceDate, "2026-09-06");
assert.equal(clear.items.length, 2);
assert.equal(clear.items[0].name, "شاشة Samsung A10");
assert.equal(clear.items[0].quantity, 2);
assert.equal(clear.items[0].unitCost, 10.5);

const mixed = extractPurchaseFromPastedText(`
Supplier: Al Noor
Date: 2026/09/06
Invoice No: A-77
شاشة A15 Original qty: ٢ cost: ١٢٫٥ SAR
A15 Copy qty: 3 cost: 8 SAR
Total: 49
`);
assert.equal(mixed.currency, "SAR");
assert.equal(mixed.items[0].quantity, 2);
assert.equal(mixed.items[0].unitCost, 12.5);
assert.equal(mixed.items[1].name?.includes("Copy"), true);

const carton = extractPurchaseFromPastedText("شاشة A10 كرتونة qty: 2 total: 100");
assert.equal(carton.items.length, 1);
assert.equal(carton.items[0].unitAmbiguous, true);
assert.equal(carton.items[0].unitCost, null);
assert.equal(carton.items[0].lineTotal, 100);
assert.equal(isPurchaseExtractedItemIncomplete(carton.items[0]), true);

const weakImageFixture = purchaseExtractedDocumentSchema.parse({
  schemaVersion: 1,
  supplierName: null,
  invoiceDate: null,
  supplierInvoiceNumber: null,
  currency: null,
  subtotal: null,
  discountTotal: null,
  shippingTotal: null,
  total: null,
  items: [{
    rowKey: "weak-1",
    originalText: "A10 ???",
    name: "A10",
    barcode: null,
    quantity: null,
    purchaseUnit: null,
    unitCost: null,
    lineTotal: null,
    salePrice: null,
    unitAmbiguous: false,
    priceAmbiguous: true,
    quantityAmbiguous: true,
    notes: ["قراءة ناقصة"],
  }],
  warnings: [],
});
assert.equal(isPurchaseExtractedItemIncomplete(weakImageFixture.items[0]), true);

const mismatch = extractPurchaseFromPastedText("A qty: 2 cost: 10\nB qty: 1 cost: 5\nTotal: 40");
assert.equal(compareExtractedTotals(mismatch).difference, 15);

const pdfDocument = await PDFDocument.create();
pdfDocument.addPage();
pdfDocument.addPage();
pdfDocument.addPage();
const pdf = await pdfDocument.save();
const pdfValidation = await validatePurchaseImportFile(pdf, "application/pdf", { maxBytes: 20_000, maxPdfPages: 3 });
assert.equal(pdfValidation.ok, true);
assert.equal(pdfValidation.pageCount, 3);
assert.equal((await validatePurchaseImportFile(pdf, "application/pdf", { maxBytes: 20_000, maxPdfPages: 2 })).ok, false);

const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00]);
assert.equal((await validatePurchaseImportFile(jpegHeader, "image/jpeg", { maxBytes: 10_000, maxPdfPages: 3 })).ok, true);

const qualityMatch = resolveImportedMatch({
  name: "شاشة A10 Original",
  exactBarcode: [],
  exactSku: [],
  nameCandidates: [
    { id: "original", name: "شاشة A10 Original" },
    { id: "copy", name: "شاشة A10 Copy" },
  ],
});
assert.equal(qualityMatch.state, "review");

console.log("PASS purchase document import samples");

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
