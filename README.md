# Evently — Smart Event Management System

A full-stack event management platform: discover events, register and pay event organizers directly, and — for
organizers and admins — create events, manage participants, mark attendance and issue certificates.

**Stack:** Node.js, Express, MongoDB (Mongoose), JWT auth, plain HTML/CSS/JavaScript frontend.

## What's included

- REST API with JWT authentication and three roles: `admin`, `organizer`, `user`
- Event CRUD with image upload, categories, venues, capacity & registration deadlines
- Registration flow with seat tracking, organizer QR payments with screenshot review, cancellation & refunds
- Manual attendance lists with participant-name search, configurable PDF certificates, and organizer-confirmed competition winner awards
- Notifications, favorites, feedback/ratings, CSV participant export
- Admin dashboard (stats, users, all events, categories, venues) and an organizer dashboard
- A complete static frontend (no build step) wired to the API, styled as a distinct "ticket stub" visual identity

## Project layout

```
event-management/
├── backend/     Express API (see backend/README below inline in this file)
└── frontend/    Static HTML/CSS/JS site, served by the backend at "/"
```

## Prerequisites

- Node.js 18+
- MongoDB running locally (or a connection string to Atlas / another MongoDB host)

## Setup

### Open in VS Code on Windows

1. Extract this project folder and open it in VS Code using **File → Open Folder**.
2. Make sure MongoDB is running locally, or use your MongoDB Atlas connection string.
3. Open the VS Code terminal (**Terminal → New Terminal**) and run:

```powershell
cd backend
Copy-Item .env.example .env
npm install
```

Open `backend/.env` in VS Code and set `MONGODB_URI` to your MongoDB connection string, then save.
Keep this file private; do not upload it to GitHub. Return to the terminal and run:

```powershell
npm run seed
npm run dev
```

The seed command creates demo admin, organizer, and participant accounts. Leave the terminal open
and visit `http://localhost:5000` in your browser. To stop the server press **Ctrl+C** in that
terminal; to start it again, run `cd backend` if needed, then `npm run dev`.

The server serves both the API and the frontend, so once it's running, open:

```
http://localhost:5000
```

### Demo accounts (created by `npm run seed`)

| Role      | Email                    | Password        |
|-----------|---------------------------|------------------|
| Admin     | admin@evently.test        | Admin@12345      |
| Organizer | organizer@evently.test    | Organizer@123    |
| User      | user@evently.test         | User@12345       |

## Environment variables (`backend/.env`)

See `backend/.env.example` for the full list and comments. The important ones:

- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — set this to a long random string in any real deployment (see the comment in `.env.example` for a one-line generator)
- `CLIENT_ORIGIN` — comma-separated allowed origins if you serve the frontend from a different host; leave empty for same-origin/dev use

## API overview

All endpoints are under `/api`. A few highlights:

```
POST   /api/auth/register            Create an account (role: user or organizer)
POST   /api/auth/login
GET    /api/events                   Search & filter published events
POST   /api/events                   Create event (organizer/admin, multipart for images)
POST   /api/registrations            Register for an event
POST   /api/payments/submit-proof    Submit payment screenshot for organizer review
GET    /api/payments/:id/proof       View private payment screenshot (participant/event staff)
PUT    /api/payments/:id/review      Approve or reject payment proof (organizer/admin)
POST   /api/attendance               Manually mark attendance (organizer/admin)
POST   /api/certificates/event/:id/issue   Issue certificates to everyone marked present
POST   /api/certificates/event/:id/rankings   Confirm first, second, third and issue winner certificates
GET    /api/certificates/verify/:certificateId   Public certificate verification
GET    /api/admin/dashboard          Platform-wide stats (admin only)
```

Every write endpoint validates input and returns `{ success: false, message }` on error with an
appropriate HTTP status code.

## Paid events

When creating a paid event, the organizer uploads the QR code for their payment account. A
participant registers, pays the organizer with their payment app, and uploads a JPG, PNG, or WebP
screenshot (up to 5 MB) on the registration page. The organizer reviews that screenshot in
**Dashboard → Participants** and approves or rejects it. Approval marks the registration paid and
confirms the seat; if rejected, the participant can upload corrected proof. The optional UPI
reference field helps the organizer match a transfer.

This is manual proof review; the app does not initiate or verify bank/UPI transfers and does not
integrate a payment gateway. Event QR images are displayed to participants who own a registration.
Payment screenshots are stored outside the public uploads folder and are available only to that
participant and the event organizer (or an admin). For a deployed server, configure persistent
private file storage or object storage so screenshots are retained across server replacements.

## Notes on the frontend

The frontend is plain HTML/CSS/JS (no framework, no build step) so it can be opened, edited and
understood directly. `frontend/js/api.js` holds the fetch wrapper and auth/session helpers used by
every page; `frontend/js/ui.js` renders the shared header/footer/notifications; `frontend/js/event-form.js`
is the shared create/edit-event modal used by both the organizer dashboard and the admin panel.

### Manual attendance

Organizers open **Dashboard → Attendance**, choose an event, and use the participant-name search
above the attendance list to find a person. The list shows the participant's account name and current
attendance status. Use **Present** or **Absent** to record attendance. Only the event organizer or an
admin can open and manage that event's attendance list.

Attendees provide their college or organization when they create an account and can update it on
their profile. While creating or editing an event, the organiser can choose a built-in certificate
layout or upload a landscape background, then customize its heading, message, and accent color. After an event ends, the running API automatically issues PDF certificates to attendees marked
present. Participants can find and download them from **My events → Certificates**. Each certificate uses the participant's account name and college or organization and remains linked to
that account for download. For older events, the organiser can use the existing issue button manually.

### Certificate PDFs

Certificate PDFs display a certificate ID and organizer name, without a QR code.

### Competition winner certificates

Mark the event as a competition when creating or editing it. After it ends, open
**Organizer Dashboard → Certificates**, select the event, and
choose a confirmed participant for first, second, and third place. Upload a landscape JPG, PNG, or
WebP certificate background (up to 2 MB), leaving clear space in the center for the participant's
name and award. Confirming the three distinct names issues personalized winner certificates and
sends each person a notification; participants can download them from **My events → Certificates**.
The organizer can update the results later; certificates for participants who lose a place are
updated to participation certificates if they were marked present. Each account has one certificate
per event, so a winner's existing participation certificate is replaced by their award certificate.

## Possible extensions

The codebase leaves room to add: email/WhatsApp notifications, an AI event-recommendation or
assistant feature, and multi-organizer team accounts — see the original project brief for details.
