import {
  dateInputUtcBoundsForTimeZone,
  localDateString,
} from "@/lib/timezone";

export type DailySummaryPeriod = "today" | "yesterday" | "month" | "day" | "custom";
export type DailySummarySearchParams = Record<string, string | string[] | undefined>;

export type DailySummaryRangeSelection = {
  period: DailySummaryPeriod;
  range: { start: Date; end: Date };
  date: string;
  month: string;
  currentMonth: string;
  from: string;
  to: string;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function shiftDateInput(value: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthDateInputs(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function resolveDailySummaryRange(
  params: DailySummarySearchParams,
  timeZone: string,
  now = new Date(),
): DailySummaryRangeSelection {
  const today = localDateString(now, timeZone);
  const currentMonth = today.slice(0, 7);
  const requestedPeriod = first(params.period);
  const period: DailySummaryPeriod =
    requestedPeriod === "yesterday" || requestedPeriod === "month" || requestedPeriod === "day" || requestedPeriod === "custom"
      ? requestedPeriod
      : "today";

  if (period === "yesterday") {
    const date = shiftDateInput(today, -1);
    return {
      period,
      range: dateInputUtcBoundsForTimeZone(date, date, timeZone)!,
      date,
      month: date.slice(0, 7),
      currentMonth,
      from: date,
      to: date,
    };
  }

  if (period === "month") {
    const month = first(params.month) || currentMonth;
    const monthInputs = monthDateInputs(month) ?? monthDateInputs(currentMonth)!;
    return {
      period,
      range: dateInputUtcBoundsForTimeZone(monthInputs.from, monthInputs.to, timeZone)!,
      date: monthInputs.to,
      month: monthInputs.from.slice(0, 7),
      currentMonth,
      from: monthInputs.from,
      to: monthInputs.to,
    };
  }

  if (period === "day") {
    const requestedDate = first(params.date) || today;
    const range = dateInputUtcBoundsForTimeZone(requestedDate, requestedDate, timeZone);
    const date = range ? requestedDate : today;
    return {
      period,
      range: range ?? dateInputUtcBoundsForTimeZone(today, today, timeZone)!,
      date,
      month: date.slice(0, 7),
      currentMonth,
      from: date,
      to: date,
    };
  }

  if (period === "custom") {
    const requestedFrom = first(params.from) || today;
    const requestedTo = first(params.to) || requestedFrom;
    let from = requestedFrom;
    let to = requestedTo;
    let range = dateInputUtcBoundsForTimeZone(from, to, timeZone);
    if (!range) {
      const reversed = dateInputUtcBoundsForTimeZone(to, from, timeZone);
      if (reversed) {
        [from, to] = [to, from];
        range = reversed;
      }
    }
    if (!range) {
      from = today;
      to = today;
      range = dateInputUtcBoundsForTimeZone(today, today, timeZone)!;
    }
    return {
      period,
      range,
      date: from,
      month: from.slice(0, 7),
      currentMonth,
      from,
      to,
    };
  }

  return {
    period: "today",
    range: dateInputUtcBoundsForTimeZone(today, today, timeZone)!,
    date: today,
    month: currentMonth,
    currentMonth,
    from: today,
    to: today,
  };
}
