export function parseUntisDate(untisDate: number): Date {
    const str = untisDate.toString();
    const year = parseInt(str.slice(0, 4), 10);
    const month = parseInt(str.slice(4, 6), 10) - 1;
    const day = parseInt(str.slice(6, 8), 10);
    return new Date(year, month, day);
}

export function utcDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function dateToUntisNumber(d: Date): number {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function normalizeClasses(classes?: string[]): string[] {
    return Array.from(
        new Set(
            (classes ?? [])
                .map((className) => className.trim().toLowerCase())
                .filter(Boolean),
        ),
    ).sort();
}

export function normalizeClassName(name: string): string {
    return name.trim().toLowerCase();
}

/* Resolves the first configured override whose class identifier matches one of the lesson's classes */
export function resolveClassOverride(
    classes: string[],
    overrides: Record<string, string> | undefined,
): string | undefined {
    if (!overrides) return undefined;

    for (const [key, value] of Object.entries(overrides)) {
        if (!value) continue;
        const normalizedKey = normalizeClassName(key);
        if (classes.some((c) => normalizeClassName(c) === normalizedKey)) {
            return value;
        }
    }

    return undefined;
}

/*
 * Renders text with a strikethrough using Unicode combining characters instead of
 * a translated "[Cancelled]" prefix. Unlike ICS STATUS:CANCELLED, this is visible
 * directly in the event title on clients that don't render STATUS specially
 * (e.g. Google Calendar subscribed/"From URL" feeds).
 */
export function strikethrough(text: string): string {
    return Array.from(text)
        .map((char) => (char === "\n" ? char : `${char}̶`))
        .join("");
}
