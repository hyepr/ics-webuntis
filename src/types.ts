export interface User {
    school: string;
    username: string;
    password: string;
    baseurl: string;
    friendlyName: string;
    classes?: string[];
    language?: "en" | "de";
    cancelledDisplay?: "hide" | "mark" | "show";
    showHolidays?: boolean;
    accessToken?: string;
    /* Maps WebUntis class identifiers (e.g. "2ku1") to a custom, human-readable event title */
    classTitles?: Record<string, string>;
    /* Maps WebUntis class identifiers (e.g. "2ku1") to a CSS3 color name (RFC 7986 COLOR) for the generated event */
    classColors?: Record<string, string>;
}

export interface Config {
    daysBefore: number;
    daysAfter: number;
    cacheDuration: number;
    timezone?: string;
    users: User[];
}

export interface Lesson {
    startTime: number;
    endTime: number;
    subject: string;
    teacher: string[];
    room: string;
    class: string[];
    date: Date;
    endDate?: Date;
    lstext: string;
    status: string;
    /* Renders as all day event */
    allDay?: boolean;
}

export interface CacheEntry {
    timestamp: number;
    ics: string;
}

export enum UntisElementType {
    CLASS = 1,
    TEACHER = 2,
    SUBJECT = 3,
    ROOM = 4,
    STUDENT = 5,
}
