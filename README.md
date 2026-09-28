# Gather Campus Events

A beginner MERN project for discovering and managing college events.

## Project folders

- `client/` is the React website.
- `server/` will hold the Express API and MongoDB connection.
- `.gitignore` tells Git which generated or private files not to upload.

## Run the project

Open **two terminals** so the website and API can run at the same time.

In terminal 1, start the API:

```powershell
cd server
npm install
npm run dev
```

In terminal 2, start the website:

```powershell
cd client
npm install
npm run dev
```

Open the local address printed by Vite, usually `http://localhost:5173`. The API address is `http://localhost:5000/api/events`.

The API serves sample events from `server/src/data/events.js`, accepts new events with `POST /api/events`, and accepts student registrations with `POST /api/events/:eventId/register`. If `server/.env` contains a working `MONGODB_URI`, events and registrations are stored in MongoDB. If MongoDB is not configured or cannot be reached, the API uses temporary memory storage; new events and registrations in that mode reset when the server restarts. See `server/README.md` for Atlas setup.

Organizers sign in before creating events or checking in tickets. Copy `server/.env.example` to `server/.env`, then change the organizer password and token secret. The sample organizer login must be changed before using the app. Never push the real `.env` file to GitHub.

Organizers can optionally attach a PNG, JPG, or WebP event poster up to 10 MB. Posters are saved in `server/uploads/` and are excluded from Git. For a hosted deployment, move poster storage to a cloud image service so the images remain available after deployment or on another computer.

Student registrations use a roll number instead of an email address. A roll number can register once per event; the server stores it in uppercase. Existing registration records are kept as they are, while new registrations use the roll-number field.

Organizers set an event seat limit (from 1 to 5000). The API rejects additional registrations after the event reaches that capacity.

Each successful registration receives a unique, randomly generated ticket code. The website creates its QR image only for that registration and displays it on screen; QR image files are not stored in MongoDB. Organizers can scan a ticket from the organizer tools panel. Check-ins are saved in MongoDB, and repeat scans are rejected. Camera access on phones requires an HTTPS website; see `server/README.md` for setup details.
