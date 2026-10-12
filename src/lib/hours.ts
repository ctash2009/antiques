// Parses the scraped `working_hours` shape (e.g. {"Monday": ["12-8PM"]}) into
// schema.org OpeningHoursSpecification entries for JSON-LD. Best-effort: any
// day whose string doesn't match a recognized pattern is silently dropped
// rather than risk emitting wrong structured data.
const DAY_URI: Record<string, string> = {
  Monday: "https://schema.org/Monday",
  Tuesday: "https://schema.org/Tuesday",
  Wednesday: "https://schema.org/Wednesday",
  Thursday: "https://schema.org/Thursday",
  Friday: "https://schema.org/Friday",
  Saturday: "https://schema.org/Saturday",
  Sunday: "https://schema.org/Sunday",
};

const RANGE_RE = /^(\d{1,2})(AM|PM)?-(\d{1,2})(AM|PM)?$/i;

// "8" + meridiem -> 24h "HH:MM". Hour 12 with no meridiem defaults to noon
// (retail convention), never midnight.
function to24h(hour: number, meridiem: string | undefined): string {
  let h = hour % 12;
  if ((meridiem ?? "PM").toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:00`;
}

export type OpeningHoursSpec = {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
};

export function parseOpeningHours(
  workingHours: Record<string, string[]> | null,
): OpeningHoursSpec[] {
  if (!workingHours) return [];
  const specs: OpeningHoursSpec[] = [];

  for (const [day, entries] of Object.entries(workingHours)) {
    const dayUri = DAY_URI[day];
    if (!dayUri || !entries) continue;

    for (const entry of entries) {
      const normalized = entry.replace(/\s+/g, "");
      const match = normalized.match(RANGE_RE);
      if (!match) continue; // e.g. "Closed", "Open 24 hours" -- skip rather than guess

      const [, openHour, openMeridiem, closeHour, closeMeridiem] = match;
      // If only one side specifies AM/PM, the other inherits it (how Google's
      // scraped format is usually written, e.g. "12-8PM" means 12PM-8PM).
      const inferredOpenMeridiem = openMeridiem ?? closeMeridiem;
      const inferredCloseMeridiem = closeMeridiem ?? openMeridiem;

      specs.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: dayUri,
        opens: to24h(Number(openHour), inferredOpenMeridiem),
        closes: to24h(Number(closeHour), inferredCloseMeridiem),
      });
    }
  }

  return specs;
}

// Human-readable list for the UI, in canonical week order. Unlike the JSON-LD
// parser, this never drops a day -- it shows whatever the source string says.
const WEEK_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function formatWeeklyHours(
  workingHours: Record<string, string[]> | null,
): { day: string; hours: string }[] {
  if (!workingHours) return [];
  return WEEK_ORDER.filter((day) => workingHours[day]).map((day) => ({
    day,
    hours: workingHours[day].join(", "),
  }));
}
