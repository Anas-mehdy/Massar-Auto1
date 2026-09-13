export type PointOfSaleTabKey = "sale" | "service" | "repair" | "software" | "electronic" | "wallet";

export function pointOfSaleReturnPath(tab: PointOfSaleTabKey) {
  return `/point-of-sale?tab=${tab}`;
}

export function readPointOfSaleReturn(value: string, expectedTab: PointOfSaleTabKey) {
  const expected = pointOfSaleReturnPath(expectedTab);
  return value === expected ? expected : null;
}

export function pointOfSaleResultPath(
  tab: PointOfSaleTabKey,
  params: Record<string, string | undefined> = {},
) {
  const search = new URLSearchParams({ tab });
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/point-of-sale?${search.toString()}`;
}
