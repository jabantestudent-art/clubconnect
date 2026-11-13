# ClubConnect

A responsive student organization portal with persistent SQLite storage, secure password hashing, role-based access, club memberships, events, QR check-in, and attendance records.

## Requirements

- Node.js 22.13 or newer
- npm
- A persistent writable disk for the SQLite database when deployed

## Run locally

1. Extract the ZIP and open the `clubconnect-starter` folder.
2. Copy `.env.example` to `.env`.
3. Set a private `JWT_SECRET` and configure `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first administrator account. The admin password must be at least 12 characters.
4. In a terminal, run `npm install`.
5. Run `npm start` (or `npm run dev` during development).
6. Open `http://localhost:3000`.

The `data/clubconnect.sqlite` file is created automatically. Accounts and application records are saved in SQLite and remain after server restarts as long as that file is retained. Passwords are stored as bcrypt hashes; the original password is never stored.

## First administrator

On the first start only, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are configured and no administrator exists, ClubConnect creates the initial administrator account. The credentials are read from environment variables and are not displayed in the application. Remove or rotate the bootstrap credentials after initial setup. New public signups always receive the Student role.

If you do not configure the bootstrap variables, signups still work, but role approvals and administrator-only functions remain unavailable until an administrator is provisioned.

## Deploying

ClubConnect uses SQLite, so deploy it as a **single application instance with a persistent disk/volume**. The SQLite file must not live on an ephemeral filesystem.

1. Push this project to your Git provider.
2. Create a Node web service using Node.js 22.13+ and `npm start` as the start command.
3. Attach a persistent disk/volume to the service.
4. Set `DB_PATH` to a file inside the mounted disk, for example `/var/data/clubconnect.sqlite`.
5. Add `JWT_SECRET` as a long random secret. Add `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` for first-admin provisioning.
6. Set `NODE_ENV=production` and deploy.
7. Confirm `https://your-domain/api/health` returns `status: ok` and `storage: persistent SQLite`.

Do not run multiple application instances against the same SQLite file. For multi-instance or serverless deployment, migrate to a managed PostgreSQL database instead. Back up the persistent database file regularly.

## Included features

- Student registration and login
- bcrypt password hashing
- Browse clubs and submit membership requests
- Officer/admin membership review with club-scoped officer permissions
- Student requests for Club Officer or Administrator roles
- Admin review and approval/rejection of role requests
- Create clubs and events
- Event QR code generation
- Member-only QR attendance check-in
- Attendance history and administrator summary
- Responsive blue interface

## Security and operations

- Configure `JWT_SECRET` before production; the server refuses to start in production without it.
- Use HTTPS in production.
- Keep `.env` private and out of source control.
- Restrict access to the persistent disk and database backups.
- Use a strong, unique administrator password.
- SQLite is suitable for a modest single-instance deployment. Use PostgreSQL for higher traffic or multiple instances.
