# Server

This folder contains the Node.js and Express API. Its first route sends sample events to the React website.

Run it from this folder with:

```powershell
npm install
npm run dev
```

The API is available at `http://localhost:5000/api/events` while the server is running.

## Organizer sign-in

Copy `.env.example` to `.env` in this `server` folder. Keep the MongoDB connection string private, and replace the sample organizer password and token secret with private values before using the app. Restart the API after changing `.env`. This beginner version uses one organizer account, which can sign in on several devices. The login stays valid for eight hours.

## Phone check-in and hosting

The API listens on all network interfaces so another device can reach it when the laptop and phone share Wi-Fi. The website's API address is controlled by `VITE_API_URL` in the client environment. On a phone, `localhost` means the phone itself, so it must point to the laptop's Wi-Fi address or to a hosted API instead.

Phone camera scanning requires a secure HTTPS website in most browsers. For scanning from phones outside localhost, host the website and API at HTTPS addresses, keep MongoDB Atlas available to the hosted API, set `VITE_API_URL` to the API's HTTPS address, and set `CLIENT_ORIGIN` to the website's exact HTTPS address. Store the server secrets in the hosting provider's environment settings; never put them in the client or commit the real `.env` file.

The check-in endpoint updates a registration only when its `checkedInAt` field is empty. MongoDB performs that update atomically, so if two phones submit the same ticket together, only one is accepted. The other gets an “already checked in” response.

## Connect MongoDB Atlas

1. Create a MongoDB Atlas cluster and a database user.
2. In Atlas, add your current IP address to the project's IP access list.
3. Choose **Connect**, then **Drivers**, and copy the connection string.
4. Put the connection string in this folder's `.env` file after `MONGODB_URI=`.
5. Restart the server with `npm run dev`.

Keep the real connection string in `.env`. The project's `.gitignore` excludes that file from GitHub. The `.env.example` file is a safe template and can be uploaded.
