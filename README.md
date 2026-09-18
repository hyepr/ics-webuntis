# ICS-WebUntis

ICS-WebUntis is a lightweight service that exports timetables from [WebUntis](https://www.untis.at/) as iCal/ ICS calendar feeds.

It is designed for reliability, minimal resource usage, and straightforward deployment via Docker.

## Features

- Fetch timetables directly from WebUntis
- Expose an iCal calendar endpoint for integration with any calendar client
- Built-in caching to reduce load on WebUntis
- Single-container deployment with Docker
- Strictly validated configuration
- Multiple Users supported
- Fetch timetables for specific classes, rooms, teachers, or subjects by name or numeric ID
- Multiple language support with automatic detection and user-specific language settings (currently supports English and German)
- Configurable handling of cancelled lessons, with a clean "❌" title marker
- Optional per-user inclusion of school holidays
- Optional per-user access token protection
- Optional per-user subject whitelist/blacklist to control which lessons show up in the personal timetable
- Optional per-user, per-subject custom event titles
- Optional per-user, per-subject event colors (client support varies, see [Colors](#colors))

## Quick Start

### Run with Docker Compose

```yaml
services:
    webuntis-timetable:
        image: nlion/ics-webuntis:latest
        container_name: webuntis-timetable
        environment:
            - NODE_ENV=production
            - PORT=7464
            - CONFIG_FILE=/app/config.json
        volumes:
            - ./dev-config.json:/app/config.json:ro
        ports:
            - "7464:7464"
        restart: unless-stopped
```

Start it with 'docker-compose up'

This will fail without a 'config.json'

## Configuration

The service requires a JSON configuration file.

`config.json` example

```json
{
    "daysBefore": 7,
    "daysAfter": 14,
    "cacheDuration": 300,
    "timezone": "Europe/Berlin",
    "users": [
        {
            "school": "myschool",
            "username": "student1",
            "password": "secret",
            "baseurl": "https://mese.webuntis.com/",
            "friendlyName": "student1",
            "subjectsWhitelist": [
                "2b3",
                "2D1",
                "2M1",
                "2ku2",
                "2WR6",
                "2e2",
                "2smw3",
                "2ph1",
                "2g1",
                "2eth2",
                "2W_WR9"
            ],
            "subjectsBlacklist": [],
            "language": "en",
            "cancelledDisplay": "mark",
            "showHolidays": true,
            "accessToken": "my-secret-token",
            "subjectTitles": {
                "2ku1": "Art",
                "2WR6": "Economics"
            },
            "subjectColors": {
                "2ku1": "coral",
                "2WR6": "darkblue"
            }
        }
    ]
}
```

| Option                        | Type    | Default          | Required | Description                                                                                                                                                                                                   |
| :----------------------------- | :------ | :--------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `daysBefore`                   | integer | `7`             | No       | Number of days in the past to fetch timetable entries for.                                                                                                                                                    |
| `daysAfter`                    | integer | `14`            | No       | Number of days in the future to fetch timetable entries for.                                                                                                                                                  |
| `cacheDuration`                | integer | `300`           | No       | Cache duration in seconds (5 minutes by default). Prevents excessive requests to WebUntis.                                                                                                                    |
| `timezone`                     | string  | `Europe/Berlin` | No       | IANA timezone name used to tag the generated iCal calendar (e.g., `Europe/Berlin`, `Europe/Vienna`).                                                                                                          |
| `users`                        | array   | `[]`            | Yes      | List of user objects for connecting to WebUntis.                                                                                                                                                              |
| `users[].school`               | string  | -               | Yes      | The school name as used in WebUntis.                                                                                                                                                                          |
| `users[].username`             | string  | -               | Yes      | The user account name.                                                                                                                                                                                        |
| `users[].password`             | string  | -               | Yes      | The user account password.                                                                                                                                                                                    |
| `users[].baseurl`              | string  | -               | Yes      | The base URL of your WebUntis instance (e.g., `https://mese.webuntis.com/`).                                                                                                                                  |
| `users[].friendlyName`         | string  | -               | Yes      | A unique local identifier for this user, used in the iCal/ ICS Endpoint.                                                                                                                                      |
| `users[].subjectsWhitelist`    | array   | all subjects    | No       | Optional list of WebUntis subject identifiers (e.g. `2b3`) used to filter the personal timetable endpoint (`/timetable/:name`) - if non-empty, only lessons with a matching subject are included. Matching is case-insensitive and ignores leading/trailing whitespace. |
| `users[].subjectsBlacklist`    | array   | none            | No       | Optional list of WebUntis subject identifiers to always exclude from the personal timetable endpoint, even if also present in `subjectsWhitelist`.                                                           |
| `users[].language`             | string  | `en`            | No       | Preferred language for the user (supported values: `en`, `de`).                                                                                                                                               |
| `users[].cancelledDisplay`     | string  | `show`          | No       | How to handle cancelled lessons. Options: `hide` (exclude them entirely), `mark` (include them but marked as CANCELLED), `show` (include them and clients decide on how to handle the ICS `STATUS` property). |
| `users[].showHolidays`         | boolean | `true`          | No       | Whether school holidays are included as all-day entries in this user's calendar feed. Set to `false` to omit them.                                                                                            |
| `users[].accessToken`          | string  | -               | No       | Optional access token(s) required to access this user's timetable.                                                                                                                                            |
| `users[].subjectTitles`        | object  | -               | No       | Maps WebUntis subject identifiers (e.g. `2ku1`) to a custom event title used in place of the raw subject code. Matching is case-insensitive and ignores leading/trailing whitespace.                          |
| `users[].subjectColors`        | object  | -               | No       | Maps WebUntis subject identifiers to a CSS3 color name (e.g. `coral`, `darkblue`) applied to matching events via the ICS `COLOR` property. See [Colors](#colors) for client support.                          |

## Usage

### Personal timetable

```text
http://<host>:7464/timetable/friendlyName
```

`<friendlyName>` is the one specified in the user configuration

Returns the personal timetable as an iCal/ ICS feed

If `subjectsWhitelist` is configured for a user, only lessons whose WebUntis subject identifier matches one of those values are included in `/timetable/:name`. If `subjectsBlacklist` is configured, lessons matching one of those values are always excluded, even if also present in `subjectsWhitelist`. Matching is case-insensitive and ignores leading/trailing whitespace.

If both `subjectsWhitelist` and `subjectsBlacklist` are omitted or empty, the existing behavior is preserved and all personal timetable lessons are included.

**Finding your subject identifiers:** WebUntis subject identifiers (e.g. `2b3`, `2WR6`) are not the same as class names shown elsewhere in WebUntis - they're the codes attached to each lesson's subject (`su`). Request `/timetable/:name` once and check the individual lesson descriptions in the resulting feed (each event's description includes a `Subject: ...` line) to see the exact identifiers your account uses.

Example user configuration with subject filtering:

```json
{
    "friendlyName": "me",
    "subjectsWhitelist": ["2b3", "2D1", "2M1", "2ku2", "2WR6", "2e2", "2smw3", "2ph1", "2g1", "2eth2", "2W_WR9"],
    "subjectsBlacklist": []
}
```

If an access token is configured, append ?access_token=my-secret:

```text
http://<host>:7464/timetable/friendlyName?access_token=my-secret
```

### Specific element timetable (class, room, teacher, subject)

`<type>`: `"class"`, `"room"`, `"teacher"`, or `"subject"`

`<id>` Either the numeric ID or the name of the element (the service will resolve the name automatically)

Example URLs:

`http://localhost:7464/timetable/student1/class/10.3`

`http://localhost:7464/timetable/student1/room/24`

`http://localhost:7464/timetable/student1/teacher/MrSmith?lang=de`

Replace `student1` with the friendly name of your user, and `class/10.3` with the desired type and ID.

If the ID cannot be resolved, the service will attempt to use it as a numeric ID.

### Exams and homework feeds

```text
http://<host>:7464/timetable/friendlyName/exams
http://<host>:7464/timetable/friendlyName/homework
```

Returns upcoming exams or homework (within the configured `daysBefore`/`daysAfter` range) as a separate iCal/ ICS feed. Unlike the personal and element timetable endpoints, they do not accept a `<id>` (class/room/teacher/subject) segment.

### Different languages

The service supports multiple languages and will attempt to detect the preferred language for each request. The detection order is as follows:

1. Query parameter `lang` (e.g., `?lang=en`)
2. User-specific language setting from the configuration file
3. `Accepted-Language` header from the request (your browser or calendar client should set this automatically based on your system settings)

### Cancelled lessons display

The `cancelledDisplay` option in the user configuration allows you to control how cancelled lessons are handled in the generated iCal/ ICS feed:

- `hide`: Cancelled lessons will be completely excluded from the feed.
- `show`: Cancelled lessons will be included and marked with `STATUS:CANCELLED`, allowing calendar clients to display them differently (e.g., crossed out).
- `mark`: Same as `show`, but the event title is prefixed with a "❌" marker (e.g., "❌ Math (Smith)"). This makes cancellations visually obvious even in clients such as Google Calendar that don't render `STATUS:CANCELLED` specially for subscribed feeds.

### Holidays

The `showHolidays` option in the user configuration controls whether school holidays are included as all-day entries in the generated feed. It defaults to `true`; set it to `false` for a user if you only want lesson entries in their calendar.

### Custom subject titles

The `subjectTitles` option lets you map a WebUntis subject identifier (as it appears in `subjectsWhitelist`/`subjectsBlacklist`, e.g. `2ku1`) to a custom, human-readable title. When a lesson or exam belongs to a matching subject, its event title uses your custom text instead of the raw WebUntis subject code:

```json
{
    "subjectTitles": {
        "2ku1": "Art",
        "2WR6": "Economics"
    }
}
```

Matching is case-insensitive and ignores leading/trailing whitespace. The teacher and class suffix (e.g. `(Smith) - (12Q)`) is still appended after your custom title; the description field always keeps the raw WebUntis data for reference.

### Colors

The `subjectColors` option lets you map a WebUntis subject identifier to a color, written into each matching event as the [RFC 7986](https://www.rfc-editor.org/rfc/rfc7986#section-5.9) `COLOR` property (a CSS3 color name, e.g. `coral`, `darkblue`, `#ignored` is not valid — use a named color):

```json
{
    "subjectColors": {
        "2ku1": "coral",
        "2WR6": "darkblue"
    }
}
```

**Important limitation:** Google Calendar does **not** support per-event colors for calendars added via "From URL" subscription (which is how this feed is normally consumed) — it only lets you pick a single color for the *entire* subscribed calendar in its own UI, and ignores the ICS `COLOR` property entirely. This is a Google Calendar limitation, not something this project can work around.

Per-event `COLOR` is still emitted because some other clients (e.g. Apple Calendar, some Thunderbird/Lightning versions) do honor it. If your primary target is Google Calendar, consider exposing each subject as its own feed (e.g. via the [element timetable endpoints](#specific-element-timetable-class-room-teacher-subject)) and assigning a different color to each subscribed calendar in Google Calendar's UI instead.

### URL parameters

The following query parameters can be used to override the default behavior for a specific request:

- `lang`: Override the detected language for this request (e.g., `?lang=en`)
- `cancelledDisplay`: Override the cancelled lessons display setting for this request (e.g., `?cancelledDisplay=mark`)
- `access_token`: Access token (if configured) in format `?access_token=my-secret`

## Contributing

Feel free to contribute at any time! If so either create an issue to discuss your changes first or just open a Pull Request if you prefer.

### Development Setup

1. **Clone the repository:**

```bash
git clone https://github.com/NLion74/ics-webuntis

cd ics-webuntis
```

2. **Install dependencies:**

```text
npm install
```

3. **Run the project locally:**

```text
npm run dev
```
