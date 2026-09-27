import { requirePermission, AuthenticationError, AuthorizationError } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { timeZoneForCountry } from "@/lib/timezone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stringCell(value: unknown) {
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function numberCell(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '<Cell><Data ss:Type="String"></Data></Cell>';
  }
  return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
}

function headerCell(value: string) {
  return `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function yesNo(value: boolean) {
  return value ? "نعم" : "لا";
}

export async function GET() {
  try {
    const auth = await requirePermission("inventory:read", { allowRedirect: false });
    const timeZone = timeZoneForCountry(auth.shop.countryCode);
    const currency = auth.shop.currency || "SAR";

    const items = await prisma.inventoryItem.findMany({
      where: {
        shopId: auth.shop.id,
        deletedAt: null,
      },
      orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        clientGeneratedId: true,
        partId: true,
        name: true,
        barcode: true,
        sku: true,
        category: true,
        description: true,
        quantity: true,
        reorderLevel: true,
        unitCost: true,
        unitPrice: true,
        salePriceConfigured: true,
        compatibilityReviewNeeded: true,
        createdAt: true,
        updatedAt: true,
        version: true,
      },
    });

    const dateFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const headers = [
      "اسم المنتج",
      "الباركود",
      "SKU",
      "التصنيف",
      "الوصف",
      "الكمية الحالية",
      "حد إعادة الطلب",
      "حالة المخزون",
      `تكلفة الوحدة (${currency})`,
      `إجمالي قيمة المخزون بالتكلفة (${currency})`,
      `سعر البيع (${currency})`,
      `إجمالي قيمة المخزون بسعر البيع (${currency})`,
      "سعر البيع مضبوط",
      "يحتاج مراجعة توافق",
      "معرّف المنتج",
      "المعرّف الخارجي",
      "معرّف الجزء",
      "الإصدار",
      "تاريخ الإضافة",
      "آخر تحديث",
    ];

    const rows = items.map((item) => {
      const unitCost = item.unitCost === null ? null : Number(item.unitCost);
      const unitPrice = Number(item.unitPrice);
      const stockCostValue = unitCost === null ? null : unitCost * item.quantity;
      const stockSaleValue = unitPrice * item.quantity;
      const stockStatus = item.quantity <= item.reorderLevel ? "مخزون منخفض" : "متوفر";

      return [
        stringCell(item.name),
        stringCell(item.barcode ?? ""),
        stringCell(item.sku ?? ""),
        stringCell(item.category ?? ""),
        stringCell(item.description ?? ""),
        numberCell(item.quantity),
        numberCell(item.reorderLevel),
        stringCell(stockStatus),
        numberCell(unitCost),
        numberCell(stockCostValue),
        numberCell(unitPrice),
        numberCell(stockSaleValue),
        stringCell(yesNo(item.salePriceConfigured)),
        stringCell(yesNo(item.compatibilityReviewNeeded)),
        stringCell(item.id),
        stringCell(item.clientGeneratedId ?? ""),
        stringCell(item.partId ?? ""),
        numberCell(item.version),
        stringCell(dateFormatter.format(item.createdAt)),
        stringCell(dateFormatter.format(item.updatedAt)),
      ].join("");
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Arial" ss:Size="10"/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="جرد المخزون">
    <Table>
      <Row ss:Height="24">${headers.map(headerCell).join("")}</Row>
      ${rows.map((row) => `<Row>${row}</Row>`).join("\n")}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <DisplayRightToLeft/>
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>1</SplitHorizontal>
      <TopRowBottomPane>1</TopRowBottomPane>
      <ProtectObjects>False</ProtectObjects>
      <ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    return new Response("\uFEFF" + xml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventory-${today}.xls"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("Inventory export failed:", error);
    return Response.json({ error: "تعذر إنشاء ملف الجرد حالياً." }, { status: 500 });
  }
}
