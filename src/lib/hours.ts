// Turns the scrape pipeline's `working_hours_csv_compatible` field (e.g.
// "Sunday,11AM,5PM|Monday,12,8PM|...") into schema.org OpeningHoursSpecification
// entries. Deliberately conservative: a day is included only when both the
// open and close time can be resolved with confidence. Bad structured data
// (wrong hours asserted as fact) is worse than missing data, so an ambiguous
// day -- most commonly a bare number with no AM/PM on the open side, e.g.
// "12,8PM" -- is only resolved when it's the one case that's unambiguous in
// context (12 paired with a PM close means noon); everything else is
// dropped rather than guessed. The free-text `working_hours` field is still
// shown to visitors as-is; this is only for the JSON-LD.

export type OpeningHours = {
  dayOfWeek: string; // schema.org day URL, e.g. "https://schema.org/Monday"
  opens: string; // "HH:MM" 24h
  closes: string; // "HH:MM" 24h
};

const DAY_URL: Record<string, string> = {
  monday: "https://schema.org/Monday",
  tuesday: "https://schema.org/Tuesday",
  wednesday: "https://schema.org/Wednesday",
  thursday: "https://schema.org/Thursday",
  friday: "https://schema.org/Friday",
  saturday: "https://schema.org/Saturday",
  sunday: "https://schema.org/Sunday",
};

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i;

type ParsedToken = { hour: number; minute: number; meridiem: "AM" | "PM" | null };

function parseToken(raw: string): ParsedToken | null {
  const m = raw.trim().match(TIME_RE);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  return {
    hour,
    minute: m[2] ? Number(m[2]) : 0,
    meridiem: (m[3]?.toUpperCase() as "AM" | "PM" | undefined) ?? null,
  };
}

function to24h(hour: number, minute: number, meridiem: "AM" | "PM"): string {
  let h = hour % 12;
  if (meridiem === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function resolvePair(openRaw: string, closeRaw: string): { opens: string; closes: string } | null {
  const open = parseToken(openRaw);
  const close = parseToken(closeRaw);
  if (!open || !close) return null;

  // Close side must be explicit -- we don't guess a closing meridiem.
  if (!close.meridiem) return null;

  let openMeridiem = open.meridiem;
  if (!openMeridiem) {
    // The only unambiguous inference: a bare "12" opening paired with a PM
    // close means noon. Anything else bare (e.g. a bare "9") is a genuine
    // guess between AM and PM -- skip rather than assert it.
    if (open.hour === 12 && close.meridiem === "PM") {
      openMeridiem = "PM";
    } else {
      return null;
    }
  }

  return {
    opens: to24h(open.hour, open.minute, openMeridiem),
    closes: to24h(close.hour, close.minute, close.meridiem),
  };
}

export function parseWorkingHoursCsv(csv: string | null | undefined): OpeningHours[] {
  if (!csv) return [];
  const results: OpeningHours[] = [];

  for (const dayGroup of csv.split("|")) {
    const parts = dayGroup.split(",").map((p) => p.trim());
    if (parts.length < 3) continue;
    const [dayRaw, openRaw, closeRaw] = parts;
    const dayUrl = DAY_URL[dayRaw.toLowerCase()];
    if (!dayUrl) continue;
    if (/closed/i.test(openRaw) || /closed/i.test(closeRaw)) continue;

    const resolved = resolvePair(openRaw, closeRaw);
    if (!resolved) continue;

    results.push({ dayOfWeek: dayUrl, ...resolved });
  }

  return results;
}
