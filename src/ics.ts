import ical, { ICalEventStatus } from "ical-generator";
import { Lesson, User } from "./types";
import { TFunction } from "i18next";
import { resolveSubjectOverride, markCancelled, utcDateOnly } from "./utils";

export interface IcsOptions {
    cancelledDisplay?: User["cancelledDisplay"];
    /* Maps WebUntis subject identifiers to a custom event title, see User.subjectTitles */
    subjectTitles?: Record<string, string>;
    /* Maps WebUntis subject identifiers to a CSS3 color name, see User.subjectColors */
    subjectColors?: Record<string, string>;
}

export function lessonsToIcs(
    lessons: Lesson[],
    timezone: string,
    requestedTimetable: string,
    t: TFunction,
    options: IcsOptions = {},
): string {
    const { cancelledDisplay = "mark", subjectTitles, subjectColors } = options;
    const cal = ical({ name: t("calendar.name"), timezone });
    // Tracks the color per created VEVENT (in creation order) so it can be injected
    // into the raw ICS output afterwards, since ical-generator has no color API.
    const eventColors: (string | undefined)[] = [];

    for (const l of lessons) {
        // Skip cancelled lessons if cancelledDisplay is set to "hide"
        if (cancelledDisplay === "hide" && l.status === "cancelled") continue;

        let calStatus: string;
        switch (l.status) {
            case "cancelled":
                calStatus = "CANCELLED";
                break;
            case "irregular":
            case "confirmed":
            default:
                calStatus = "CONFIRMED";
                break;
        }

        if (l.allDay) {
            const start = utcDateOnly(l.date);
            const end = l.endDate
                ? new Date(
                      Date.UTC(
                          l.endDate.getFullYear(),
                          l.endDate.getMonth(),
                          l.endDate.getDate() + 1,
                      ),
                  )
                : undefined;

            const titleOverride = resolveSubjectOverride(l.subject, subjectTitles);
            const title = titleOverride ?? l.lstext;
            const summary =
                cancelledDisplay !== "show" && l.status === "cancelled"
                    ? markCancelled(title)
                    : title;

            cal.createEvent({
                start,
                end,
                allDay: true,
                summary,
                description: `${t("calendar.timetable")}: ${requestedTimetable}\n${t(
                    "calendar.status",
                )}: ${l.status}`,
                status: calStatus as ICalEventStatus,
            });
            eventColors.push(resolveSubjectOverride(l.subject, subjectColors));
            continue;
        }

        const startHour = Math.floor(l.startTime / 100);
        const startMinute = l.startTime % 100;
        const endHour = Math.floor(l.endTime / 100);
        const endMinute = l.endTime % 100;

        const unknownTeacher = t("calendar.unknown_teacher");
        const unknownClass = t("calendar.unknown_class");

        const teacherCount = l.teacher.length;
        const teacherList = l.teacher.slice(0, 3).join(", ");
        const teacherSummary =
            teacherCount > 3
                ? `${teacherList} ...+${teacherCount - 3}`
                : teacherList;

        const classCount = l.class.length;
        const classList = l.class.slice(0, 3).join(", ");
        const classSummary =
            classCount > 3 ? `${classList} ...+${classCount - 3}` : classList;

        // custom title override or hide/use alternative text for ics SUMMARY if subject is unknown
        const titleOverride = resolveSubjectOverride(l.subject, subjectTitles);
        const subjectText =
            titleOverride ?? (l.subject === "Event" ? l.lstext : l.subject);

        let calSummary = [
            subjectText,
            teacherSummary !== unknownTeacher && `(${teacherSummary})`,
            teacherSummary !== unknownTeacher &&
                classSummary !== unknownClass &&
                "-",
            classSummary !== unknownClass && `(${classSummary})`,
        ]
            .filter(Boolean)
            .join(" ");

        // Prefix with a "❌" marker instead of relying on STATUS:CANCELLED so
        // cancellations are visible even on clients that ignore it (e.g.
        // Google Calendar's "From URL" subscriptions).
        if (cancelledDisplay !== "show" && l.status === "cancelled") {
            calSummary = markCancelled(calSummary);
        }

        const calDescription = `${t("calendar.subject")}: ${
            l.subject
        }\n${t("calendar.teacher")}: ${l.teacher.join(", ")}\n${t("calendar.room")}: ${
            l.room
        }\n${t("calendar.class")}: ${l.class.join(
            ", ",
        )}\n${t("calendar.timetable")}: ${requestedTimetable}\n${t("calendar.status")}: ${l.status}\nlstext: ${
            l.lstext
        }`;

        cal.createEvent({
            start: new Date(
                l.date.getFullYear(),
                l.date.getMonth(),
                l.date.getDate(),
                startHour,
                startMinute,
            ),
            end: new Date(
                l.date.getFullYear(),
                l.date.getMonth(),
                l.date.getDate(),
                endHour,
                endMinute,
            ),
            summary: calSummary,
            location: l.room,
            description: calDescription,
            status: calStatus as ICalEventStatus,
        });
        eventColors.push(resolveSubjectOverride(l.subject, subjectColors));
    }

    return injectEventColors(cal.toString(), eventColors);
}

/*
 * ical-generator has no API for the RFC 7986 COLOR property, so it's injected
 * into the raw ICS output afterwards, matching VEVENT blocks by creation order.
 *
 * Note: this is a best-effort standards-compliant hint for clients that support
 * per-event color (e.g. Apple Calendar, Thunderbird). Google Calendar ignores
 * per-event colors entirely for calendars subscribed "From URL" - it only allows
 * choosing a single color for the whole subscribed calendar in its own UI.
 */
function injectEventColors(
    ics: string,
    colors: (string | undefined)[],
): string {
    let index = -1;
    return ics.replace(/END:VEVENT\r?\n/g, (match) => {
        index++;
        const color = colors[index];
        return color ? `COLOR:${color}\r\n${match}` : match;
    });
}
