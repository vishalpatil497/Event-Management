# Gatherly - Event Management SaaS

Gatherly is a full-stack event-management MVP. It supports public event discovery, account registration, event submissions, bookings, and admin moderation using a React client, Express API, and MongoDB Atlas.

## What works

- Public landing page and event discovery with filtering
- User registration, login, logout, and secure HTTP-only sessions
- Event creation with a pending-review workflow
- Organizer-facing **My events** page with submission status
- Event booking with atomic seat availability updates
- User booking history and ticket references
- Admin dashboard with live MongoDB totals
- Admin pages for events, users, bookings, and analytics
- Approve or reject event submissions
- Starter event seeding for a fresh database
- Responsive desktop, tablet, and mobile layouts

## Project structure

```text
client/   React + Vite + TypeScript interface
server/   Express + Mongoose + TypeScript API
.env      Local application configuration (not committed)
```

## Requirements

- Node.js 18 or newer
- npm
- MongoDB Atlas cluster and database user
- Your IP address allowed in MongoDB Atlas Network Access

## Configuration

Create a root `.env` file with:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=replace-with-a-long-random-value
JWT_REFRESH_SECRET=replace-with-a-long-random-value
ADMIN_EMAIL=admin123@gmail.com
ADMIN_PASSWORD=admin@123
```

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are optional only because the requested development defaults are already supported. Set them explicitly before deployment.

## Run locally

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm run dev:server
```

In a second terminal, start the client:

```bash
npm run dev:client
```

Open `http://localhost:5173`.

## Verification

Run the production build check:

```bash
npm run build
```

## Production work still to do

- Payments and refunds
- Email or SMS notifications
- Image uploads through object storage
- Event editing, cancellation, and deletion flows
- User account settings
- Pagination and automated tests
- Deployment, HTTPS, monitoring, and Redis-backed rate limiting
