import {
    WebUntis,
    Timegrid,
    Holiday,
    Exam as UntisExam,
    Homework as UntisHomework,
} from "webuntis";
import { Lesson, User, UntisElementType } from "./types";
import { parseUntisDate, dateToUntisNumber, normalizeClasses } from "./utils";
import { mergeLessons } from "./merge";

interface SessionEntry {
    untis: WebUntis;
    timestamp: number;
}

export const sessionCache = new Map<string, SessionEntry>();
export const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getUntisSession(user: User): Promise<WebUntis> {
    const cached = sessionCache.get(user.username);
    const now = Date.now();

    if (cached && now - cached.timestamp < SESSION_TTL_MS) {
        return cached.untis;
    }

    if (cached) {
        try {
            await cached.untis.logout();
        } catch {}
        sessionCache.delete(user.username);
    }

    const baseUrl = user.baseurl
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");

    const untis = new WebUntis(
        user.school,
        user.username,
        user.password,
        baseUrl,
    );

    try {
        await untis.login();
    } catch (error) {
        throw Object.assign(
            error instanceof Error ? error : new Error(String(error)),
            { authError: true },
        );
    }

    sessionCache.set(user.username, { untis, timestamp: now });

    return untis;
}

function invalidateSession(user: User, untis: WebUntis): void {
    sessionCache.delete(user.username);
    untis.logout().catch(() => {});
}

function isRestrictedEntry(entry: any): boolean {
    return !entry.su?.length && !entry.te?.length && !entry.ro?.length;
}

function createAllowedClassSet(classes: User["classes"]): Set<string> {
    return new Set(normalizeClasses(classes));
}

function matchesAllowedClass(entry: any, allowedClasses: Set<string>): boolean {
    return (
        entry.kl?.some((lessonClass: any) => {
            const className =
                typeof lessonClass?.name === "string"
                    ? lessonClass.name.trim().toLowerCase()
                    : "";
            return allowedClasses.has(className);
        }) ?? false
    );
}

/*
 * DEBUG ONLY: prints every distinct `kl` (class) object returned by
 * getOwnTimetableForRange, plus every distinct value seen on OTHER
 * entry-level fields that could plausibly be the "real" course/group
 * identifier instead of `kl` (e.g. `sg`, the Stundenplangruppe/course-group
 * code that Oberstufe/Kurssystem schools often use instead of a per-course
 * Klasse). No credentials, tokens, or personal data are touched — only
 * generic timetable metadata.
 */
function debugLogDistinctClasses(rawTimetable: any[]): void {
    const seenClasses = new Map<string, Record<string, unknown>>();
    const seenSg = new Set<string>();
    const seenActivityType = new Set<string>();
    const seenLsnumber = new Set<string>();

    for (const entry of rawTimetable) {
        for (const kl of entry.kl ?? []) {
            const key = `${kl?.id}:${kl?.name}`;
            if (!seenClasses.has(key)) {
                seenClasses.set(key, {
                    id: kl?.id,
                    name: kl?.name,
                    longname: kl?.longname,
                    orgid: kl?.orgid,
                    orgname: kl?.orgname,
                });
            }
        }
        if (entry.sg !== undefined) seenSg.add(String(entry.sg));
        if (entry.activityType !== undefined)
            seenActivityType.add(String(entry.activityType));
        if (entry.lsnumber !== undefined)
            seenLsnumber.add(String(entry.lsnumber));
    }

    console.log(
        "[DEBUG] WebUntis classes found (kl):",
        JSON.stringify(Array.from(seenClasses.values()), null, 2),
    );
    console.log(
        "[DEBUG] Distinct entry.sg values (possible course/group identifier):",
        JSON.stringify(Array.from(seenSg), null, 2),
    );
    console.log(
        "[DEBUG] Distinct entry.activityType values:",
        JSON.stringify(Array.from(seenActivityType), null, 2),
    );
    console.log(
        "[DEBUG] Distinct entry.lsnumber values:",
        JSON.stringify(Array.from(seenLsnumber), null, 2),
    );
}

/*
 * DEBUG ONLY: for each timetable entry, prints the FULL raw entry (as
 * returned by getOwnTimetableForRange) alongside whether
 * matchesAllowedClass() considered it a match against the configured
 * allowed classes. This is intentionally exhaustive — not just `kl` — so
 * every candidate identifier field (sg, id, lsnumber, su/te/ro ids, etc.)
 * is visible without having to guess which one is the "real" one.
 * Timetable entries never carry credentials/tokens/cookies, so logging the
 * whole entry is safe.
 */
function debugLogFilterDecision(
    entry: any,
    allowedClasses: Set<string>,
    matched: boolean,
): void {
    console.log(
        "[DEBUG] Entry kl fields (id/name/longname/orgname/orgid):",
        JSON.stringify(
            (entry.kl ?? []).map((kl: any) => ({
                id: kl?.id,
                name: kl?.name,
                longname: kl?.longname,
                orgname: kl?.orgname,
                orgid: kl?.orgid,
            })),
            null,
            2,
        ),
    );
    console.log(
        "[DEBUG] Timetable entry filter check:",
        JSON.stringify(
            {
                entry,
                allowedClasses: Array.from(allowedClasses),
                matched,
            },
            null,
            2,
        ),
    );
}

export async function fetchTimetable(
    user: User,
    startDate: Date,
    endDate: Date,
    type?: "class" | "room" | "teacher" | "subject",
    id?: string | number,
): Promise<Lesson[]> {
    const untis = await getUntisSession(user);

    try {
        if (startDate > endDate) {
            throw Object.assign(new Error("startDate must be before endDate"), {
                code: 400,
            });
        }

        const schoolyear = await untis.getCurrentSchoolyear();

        const clampedStartDate = new Date(
            Math.max(startDate.getTime(), schoolyear.startDate.getTime()),
        );
        const clampedEndDate = new Date(
            Math.min(endDate.getTime(), schoolyear.endDate.getTime()),
        );

        if (clampedStartDate > clampedEndDate) {
            throw Object.assign(
                new Error(
                    "Requested range does not overlap with the current school year",
                ),
                { code: 400 },
            );
        }

        let numericId: number | undefined;

        if (type && id !== undefined) {
            console.log(`Resolving ${type} name "${id}" to numeric ID`);
            try {
                const idStr = String(id).toLowerCase();

                switch (type) {
                    case "class": {
                        const classes = await untis.getClasses(
                            true,
                            schoolyear.id,
                        );
                        numericId = classes.find(
                            (c) =>
                                c.name.toLowerCase() === idStr ||
                                c.longName.toLowerCase() === idStr,
                        )?.id;
                        break;
                    }
                    case "room": {
                        const rooms = await untis.getRooms(true);
                        numericId = rooms.find(
                            (r) =>
                                r.name.toLowerCase() === idStr ||
                                r.longName.toLowerCase() === idStr,
                        )?.id;
                        break;
                    }
                    case "teacher": {
                        const teachers = await untis.getTeachers(true);
                        numericId = teachers.find(
                            (t) =>
                                t.name.toLowerCase() === idStr ||
                                t.longName.toLowerCase() === idStr,
                        )?.id;
                        break;
                    }
                    case "subject": {
                        const subjects = await untis.getSubjects(true);
                        numericId = subjects.find(
                            (s) =>
                                s.name.toLowerCase() === idStr ||
                                s.longName.toLowerCase() === idStr,
                        )?.id;
                        break;
                    }
                }
            } catch (err) {
                console.warn(
                    `Failed to resolve ${type} name "${id}" to numeric ID:`,
                    err,
                );
            }

            if (!numericId) {
                const parsed = Number(id);
                if (!isNaN(parsed)) {
                    numericId = parsed;
                } else {
                    throw Object.assign(
                        new Error(
                            `No ${type} found matching "${id}" (case-insensitive)`,
                        ),
                        { code: 404, reason: "id_not_found" },
                    );
                }
            }
        }

        let rawTimetable: any[];
        if (!type || numericId === undefined) {
            rawTimetable = await untis.getOwnTimetableForRange(
                clampedStartDate,
                clampedEndDate,
            );

            debugLogDistinctClasses(rawTimetable);

            const allowedClasses = createAllowedClassSet(user.classes);
            if (allowedClasses.size > 0) {
                rawTimetable = rawTimetable.filter((entry: any) => {
                    const matched = matchesAllowedClass(entry, allowedClasses);
                    debugLogFilterDecision(entry, allowedClasses, matched);
                    return matched;
                });
            }
        } else {
            const typeMap: Record<string, UntisElementType> = {
                class: UntisElementType.CLASS,
                teacher: UntisElementType.TEACHER,
                subject: UntisElementType.SUBJECT,
                room: UntisElementType.ROOM,
            };

            rawTimetable = await untis.getTimetableForRange(
                clampedStartDate,
                clampedEndDate,
                numericId,
                typeMap[type],
                true,
            );
        }

        if (!rawTimetable || rawTimetable.length === 0) {
            throw Object.assign(new Error("No timetable found"), {
                code: 404,
                reason: "empty_range",
            });
        }

        const lessons: Lesson[] = rawTimetable
            .filter((entry: any) => {
                const subject = entry.su?.[0]?.longname?.toLowerCase() ?? "";
                const teacher = entry.te?.[0]?.name?.toLowerCase() ?? "";
                if (subject.startsWith("eva")) return false;
                if (teacher.startsWith("eva")) return false;
                return true;
            })
            .map((entry: any) => ({
                startTime: entry.startTime,
                endTime: entry.endTime,
                subject:
                    entry.su?.[0]?.name || entry.sg || entry.lstext || "Event",
                teacher: entry.te?.map((t: any) => t.name) || [
                    "Unknown Teacher",
                ],
                room: entry.ro?.[0]?.name || "Unknown Room",
                class: entry.kl?.map((k: any) => k.name) || ["Unknown Class"],
                date: parseUntisDate(entry.date),
                lstext: entry.lstext || "No Text",
                status: entry.code || "confirmed",
                allDay: isRestrictedEntry(entry),
            }));

        if (lessons.length === 0) {
            throw Object.assign(new Error("No timetable found"), {
                code: 404,
                reason: "empty_range",
            });
        }

        const timegrids: Timegrid[] = await untis.getTimegrid();

        const validTimegrids = timegrids.filter(
            (tg) => tg.timeUnits.length > 0,
        );

        if (validTimegrids.length === 0) {
            return mergeLessons(lessons, 0, 0);
        }

        const schoolStartTime = Math.min(
            ...validTimegrids.flatMap((tg) =>
                tg.timeUnits.map((u) => u.startTime),
            ),
        );

        const schoolEndTime = Math.max(
            ...validTimegrids.flatMap((tg) =>
                tg.timeUnits.map((u) => u.endTime),
            ),
        );

        const merged = mergeLessons(lessons, schoolStartTime, schoolEndTime);

        return merged.map((l) => ({
            ...l,
            allDay:
                !!l.allDay &&
                l.startTime <= schoolStartTime &&
                l.endTime >= schoolEndTime,
        }));
    } catch (error: any) {
        const isKnownAppError = typeof error?.code === "number";
        if (error?.authError || !isKnownAppError) {
            invalidateSession(user, untis);
        }
        throw error;
    }
}

export async function fetchHolidays(
    user: User,
    startDate: Date,
    endDate: Date,
): Promise<Lesson[]> {
    const untis = await getUntisSession(user);
    try {
        const holidays: Holiday[] = await untis.getHolidays();
        const startNum = dateToUntisNumber(startDate);
        const endNum = dateToUntisNumber(endDate);

        return holidays
            .filter((h) => h.endDate >= startNum && h.startDate <= endNum)
            .map((h) => ({
                startTime: 0,
                endTime: 0,
                subject: h.longName || h.name,
                teacher: [],
                room: "",
                class: [],
                date: parseUntisDate(h.startDate),
                endDate: parseUntisDate(h.endDate),
                lstext: h.longName || h.name,
                status: "confirmed",
                allDay: true,
            }));
    } catch (error) {
        console.warn(
            `Failed to fetch holidays for ${user.friendlyName}:`,
            error,
        );
        return [];
    }
}

export async function fetchExams(
    user: User,
    startDate: Date,
    endDate: Date,
): Promise<Lesson[]> {
    const untis = await getUntisSession(user);
    try {
        const schoolyear = await untis.getCurrentSchoolyear();

        const clampedStartDate = new Date(
            Math.max(startDate.getTime(), schoolyear.startDate.getTime()),
        );
        const clampedEndDate = new Date(
            Math.min(endDate.getTime(), schoolyear.endDate.getTime()),
        );

        if (clampedStartDate > clampedEndDate) {
            console.warn(
                `Requested exam range for ${user.friendlyName} does not overlap with the current school year`,
            );
            return [];
        }

        const exams: UntisExam[] = await untis.getExamsForRange(
            clampedStartDate,
            clampedEndDate,
        );

        return exams.map((e) => ({
            startTime: e.startTime,
            endTime: e.endTime,
            subject: e.subject || "Unknown Subject",
            teacher: e.teachers?.length ? e.teachers : ["Unknown Teacher"],
            room: e.rooms?.length ? e.rooms.join(", ") : "Unknown Room",
            class: e.studentClass?.length ? e.studentClass : ["Unknown Class"],
            date: parseUntisDate(e.examDate),
            lstext:
                [e.examType, e.name, e.text].filter(Boolean).join(": ") ||
                "Exam",
            status: "confirmed",
            allDay: false,
        }));
    } catch (error: any) {
        console.warn(
            `Failed to fetch exams for ${user.friendlyName}:`,
            error?.response?.status,
            error?.response?.data ?? error?.message ?? error,
        );
        return [];
    }
}

export async function fetchHomework(
    user: User,
    startDate: Date,
    endDate: Date,
): Promise<Lesson[]> {
    const untis = await getUntisSession(user);
    try {
        const schoolyear = await untis.getCurrentSchoolyear();

        const clampedStartDate = new Date(
            Math.max(startDate.getTime(), schoolyear.startDate.getTime()),
        );
        const clampedEndDate = new Date(
            Math.min(endDate.getTime(), schoolyear.endDate.getTime()),
        );

        if (clampedStartDate > clampedEndDate) {
            console.warn(
                `Requested homework range for ${user.friendlyName} does not overlap with the current school year`,
            );
            return [];
        }

        const raw: any = await untis.getHomeWorksFor(
            clampedStartDate,
            clampedEndDate,
        );

        const homework: UntisHomework[] = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.homeworks)
              ? raw.homeworks
              : Object.values(raw?.homeworks ?? {});

        return homework.map((h) => ({
            startTime: 0,
            endTime: 0,
            subject: "Homework",
            teacher: [],
            room: "",
            class: [],
            date: parseUntisDate(h.dueDate),
            lstext:
                [h.text, h.remark].filter(Boolean).join(" — ") || "Homework",
            status: "confirmed", // was "homework"
            allDay: true,
        }));
    } catch (error: any) {
        console.warn(
            `Failed to fetch homework for ${user.friendlyName}:`,
            error?.response?.status,
            error?.response?.data ?? error?.message ?? error,
        );
        return [];
    }
}
