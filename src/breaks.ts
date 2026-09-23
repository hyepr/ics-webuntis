import { Lesson } from "./types";

const BREAK_TIMES: { startTime: number; endTime: number }[] = [
    { startTime: 930, endTime: 950 },
    { startTime: 1120, endTime: 1140 },
];

function isHoliday(date: Date, holidays: Lesson[]): boolean {
    const time = date.getTime();
    return holidays.some((h) => {
        if (!h.allDay) return false;
        const start = new Date(
            h.date.getFullYear(),
            h.date.getMonth(),
            h.date.getDate(),
        ).getTime();
        const endDate = h.endDate ?? h.date;
        const end = new Date(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate(),
        ).getTime();
        return time >= start && time <= end;
    });
}

/*
 * Generates the two fixed 20-minute break events (9:30-9:50, 11:20-11:40)
 * for every school day (Mon-Fri, excluding holidays) in the given range.
 */
export function generateBreakLessons(
    startDate: Date,
    endDate: Date,
    holidays: Lesson[],
    breakTitle: string,
): Lesson[] {
    const breaks: Lesson[] = [];
    const cursor = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate(),
    );
    const end = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
    );

    while (cursor <= end) {
        const weekday = cursor.getDay();
        if (weekday >= 1 && weekday <= 5 && !isHoliday(cursor, holidays)) {
            for (const { startTime, endTime } of BREAK_TIMES) {
                breaks.push({
                    startTime,
                    endTime,
                    subject: breakTitle,
                    teacher: [],
                    room: "",
                    class: [],
                    date: new Date(cursor),
                    lstext: breakTitle,
                    status: "confirmed",
                    allDay: false,
                });
            }
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    return breaks;
}
