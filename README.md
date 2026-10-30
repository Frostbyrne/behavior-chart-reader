# Behavior Chart Reader

A teacher photographs a student's paper daily behavior chart (the STAR
"Student and Teachers Are Reflecting" chart and similar layouts). AI reads the
circled ratings and handwritten notes, the teacher checks the reading against
the paper, and the reviewed chart goes into their own Google Sheet:

- **Overview**: one row per student with chart count, latest and average score, and a sparkline of the last 10 charts. Every value is a live formula over the Daily Log.
- **Daily Log**: one row per chart, newest first, banded and filterable, with a link to the chart itself.
- **A tab per student**: each chart is a color-coded grid shaped like the paper (green / yellow / red tiles, crossed-out periods greyed, handwritten notes as cell notes), newest first, with a trend line.

## Student data: processed, never stored

| Where | What happens |
| --- | --- |
| Browser | The photo is shrunk and stripped of EXIF (location, device) before upload. The Google token is held in memory only. The only thing saved in the browser is the sheet's ID. |
| `/api/read` | Checks the Google token was issued to this app for an allowed account, sends the photo to AI Gateway, returns the reading. No database, no blob storage, no files; logs record error kinds only, never chart content. |
| AI Gateway | Every request sets `zeroDataRetention: true`, so it only routes to providers with zero-data-retention agreements. AI Gateway itself keeps no prompts or outputs. |
| Google Sheets | The reviewed chart goes from the teacher's browser straight to their own sheet. This app's server never sees it. The `drive.file` scope lets the app touch only the sheets it created. |

## Setup

1. **Google OAuth client** (Google Cloud Console, any Google account)
   - Enable the Google Sheets API and the Google Drive API.
   - Google Auth Platform → Audience: **External**. Leave it in Testing and add each user's Google address as a test user, or publish it: with only non-sensitive scopes there is no verification review.
   - Data access: `drive.file`, `openid`, `email`, `profile`.
   - Clients → Web application. Authorized JavaScript origins: the production URL and `http://localhost:3000`. No redirect URIs.
   - If a user signs in with a school Google Workspace account, that school's admin may need to allow the app (Admin console → Security → API controls).
2. **Vercel environment variables**

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | The OAuth client ID (public) |
   | `ALLOWED_EMAILS` | Comma-separated Google addresses allowed to read charts. `*` allows any Google account; empty means nobody. |
   | `ALLOWED_EMAIL_DOMAINS` | Optional: allow a whole domain instead |
   | `AI_GATEWAY_MODEL` | Optional. Default `anthropic/claude-sonnet-5.5` |
   | `AI_GATEWAY_FALLBACK_MODELS` | Optional, comma-separated, e.g. `anthropic/claude-opus-5.5` |
   | `READS_PER_HOUR_PER_USER` | Optional. Default 120 |

   AI Gateway authenticates with the deployment's OIDC token; no API key is needed on Vercel. Set an AI Gateway budget for the project to cap spend.

## Develop

```bash
pnpm install
vercel link && vercel env pull .env.local   # OIDC token for AI Gateway
pnpm dev
pnpm check:read          # one live read of fixtures/sample-chart.jpg, scored against its answer key
```

`fixtures/` holds a fictional chart (made-up student) drawn by `scripts/make-sample-chart.py`. Never commit real charts.

## License

Copyright (C) 2026 James Byrne

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. See [LICENSE](LICENSE).
