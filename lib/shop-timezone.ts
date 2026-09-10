import { prisma } from "@/lib/prisma";
import { timeZoneForCountry } from "@/lib/timezone";

export {
  COUNTRY_TIME_ZONES,
  dateInputEndUtcForTimeZone,
  dateInputStartUtcForTimeZone,
  dateInputUtcBoundsForTimeZone,
  dateInputValueForTimeZone,
  dayUtcBoundsForTimeZone,
  isWithinUtcBounds,
  localDateParts,
  localDateString,
  monthUtcBoundsForTimeZone,
  timeZoneForCountry,
  yearUtcBoundsForTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/timezone";

export async function getShopTimeZone(shopId: string) {
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: { countryCode: true },
  });
  return timeZoneForCountry(shop?.countryCode);
}

export function formatDateTimeInTimeZone(value: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(value));
}
