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

export function normalizeSubjects(subjects?: string[]): string[] {
    return Array.from(
        new Set(
            (Array.isArray(subjects) ? subjects : [])
                .map((subject) => subject.trim().toLowerCase())
                .filter(Boolean),
        ),
    ).sort();
}

export function normalizeSubjectName(name: string): string {
    return name.trim().toLowerCase();
}

/* Resolves the configured override, if any, whose subject identifier matches the lesson's subject */
export function resolveSubjectOverride(
    subject: string,
    overrides: Record<string, string> | undefined,
): string | undefined {
    if (!overrides) return undefined;

    const normalizedSubject = normalizeSubjectName(subject);
    for (const [key, value] of Object.entries(overrides)) {
        if (!value) continue;
        if (normalizeSubjectName(key) === normalizedSubject) {
            return value;
        }
    }

    return undefined;
}

/*
 * Prefixes cancelled lesson titles with a "❌" marker instead of a translated
 * "[Cancelled]" prefix. Unlike ICS STATUS:CANCELLED, this is visible directly
 * in the event title on clients that don't render STATUS specially (e.g.
 * Google Calendar subscribed/"From URL" feeds).
 */
export function markCancelled(text: string): string {
    return `❌ ${text}`;
}
