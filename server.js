require("dotenv").config();
const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const crypto = require("crypto");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const port = process.env.PORT || 3000;
// Set a long, private JWT_SECRET in production.
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured in production.");
}
const jwtSecret = process.env.JWT_SECRET || "local-development-secret-change-before-deploy";
const databasePath = process.env.DB_PATH || path.join(__dirname, "data", "clubconnect.sqlite");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','officer','admin')), assigned_club_ids TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')), requested_at TEXT NOT NULL, UNIQUE(user_id, club_id));
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, qr_token TEXT UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attendance_logs (id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, checked_in_at TEXT NOT NULL, UNIQUE(event_id,user_id));
CREATE TABLE IF NOT EXISTS role_requests (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, requested_role TEXT NOT NULL CHECK(requested_role IN ('officer','admin')), club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL, reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')), requested_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL, reviewer_note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_memberships_club ON memberships(club_id);
CREATE INDEX IF NOT EXISTS idx_events_club ON events(club_id);
CREATE INDEX IF NOT EXISTS idx_attendance_event ON attendance_logs(event_id);`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && res.statusCode >= 200 && res.statusCode < 300) {
      try {
        saveDatabase();
      } catch (error) {
        console.error("Database save failed:", error);
        res.status(500);
        return sendJson({ error: "The database could not save this change. Please try again." });
      }
    }
    return sendJson(body);
  };
  next();
});

// Request-layer collections are hydrated from SQLite at startup and synchronized after writes.
const users = [];
const clubs = [];
const memberships = [];
const events = [];
const attendanceLogs = [];
const roleRequests = [];
let nextUserId = 1, nextClubId = 1, nextMembershipId = 1, nextEventId = 1, nextAttendanceId = 1, nextRoleRequestId = 1;

// Load persisted SQL records into the existing request-layer collections.
function loadDatabase() {
  users.push(...db.prepare("SELECT * FROM users ORDER BY id").all().map(r => ({ ...r, assigned_club_ids: JSON.parse(r.assigned_club_ids || "[]") })));
  clubs.push(...db.prepare("SELECT * FROM clubs ORDER BY id").all());
  memberships.push(...db.prepare("SELECT * FROM memberships ORDER BY id").all());
  events.push(...db.prepare("SELECT * FROM events ORDER BY id").all());
  attendanceLogs.push(...db.prepare("SELECT * FROM attendance_logs ORDER BY id").all());
  roleRequests.push(...db.prepare("SELECT * FROM role_requests ORDER BY id").all());
  const max = (items) => items.reduce((n, item) => Math.max(n, Number(item.id) || 0), 0) + 1;
  nextUserId=max(users); nextClubId=max(clubs); nextMembershipId=max(memberships);
  nextEventId=max(events); nextAttendanceId=max(attendanceLogs); nextRoleRequestId=max(roleRequests);
}

// Persist every successful write in one SQLite transaction. Passwords are already bcrypt hashes.
function saveDatabase() {
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.exec("DELETE FROM attendance_logs; DELETE FROM role_requests; DELETE FROM memberships; DELETE FROM events; DELETE FROM clubs; DELETE FROM users;");
  const addUser=db.prepare("INSERT INTO users(id,full_name,email,password_hash,role,assigned_club_ids,created_at) VALUES(?,?,?,?,?,?,?)");
  users.forEach(u=>addUser.run(u.id,u.full_name,u.email,u.password_hash,u.role,JSON.stringify(u.assigned_club_ids || []),u.created_at));
  const addClub=db.prepare("INSERT INTO clubs(id,name,category,description,created_by,created_at) VALUES(?,?,?,?,?,?)");
  clubs.forEach(c=>addClub.run(c.id,c.name,c.category,c.description,c.created_by,c.created_at));
  const addMembership=db.prepare("INSERT INTO memberships(id,user_id,club_id,status,requested_at) VALUES(?,?,?,?,?)");
  memberships.forEach(m=>addMembership.run(m.id,m.user_id,m.club_id,m.status,m.requested_at));
  const addEvent=db.prepare("INSERT INTO events(id,club_id,title,description,location,starts_at,created_by,qr_token,created_at) VALUES(?,?,?,?,?,?,?,?,?)");
  events.forEach(e=>addEvent.run(e.id,e.club_id,e.title,e.description,e.location,e.starts_at,e.created_by,e.qr_token,e.created_at || new Date().toISOString()));
  const addAttendance=db.prepare("INSERT INTO attendance_logs(id,event_id,user_id,checked_in_at) VALUES(?,?,?,?)");
  attendanceLogs.forEach(a=>addAttendance.run(a.id,a.event_id,a.user_id,a.checked_in_at));
  const addRole=db.prepare("INSERT INTO role_requests(id,user_id,requested_role,club_id,reason,status,requested_at,reviewed_at,reviewed_by,reviewer_note) VALUES(?,?,?,?,?,?,?,?,?,?)");
    roleRequests.forEach(r=>addRole.run(r.id,r.user_id,r.requested_role,r.club_id,r.reason,r.status,r.requested_at,r.reviewed_at,r.reviewed_by,r.reviewer_note || ""));
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}


function createToken(user) {
  return jwt.sign({ id: user.id, name: user.full_name, email: user.email, role: user.role }, jwtSecret, { expiresIn: "8h" });
}
function publicUser(user) { return { id: user.id, name: user.full_name, email: user.email, role: user.role, assigned_club_ids: user.assigned_club_ids || [] }; }
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in first." });
  try {
    const payload = jwt.verify(token, jwtSecret);
    // Read the current role from memory, not the older role saved in the token.
    // This lets an approved role change take effect without logging out and in.
    const user = users.find(u => u.id === Number(payload.id));
    if (!user) return res.status(401).json({ error: "Account not found. Please log in again." });
    req.user = publicUser(user);
    next();
  } catch { return res.status(401).json({ error: "Your session expired. Please log in again." }); }
}
function requireRole(...roles) {
  return (req, res, next) => !req.user || !roles.includes(req.user.role)
    ? res.status(403).json({ error: "You do not have permission to do that." }) : next();
}
function canManageClub(user, clubId) {
  const club = clubs.find(c => c.id === Number(clubId));
  return user.role === "admin" || (user.role === "officer" && !!club && (club.created_by === user.id || (users.find(u => u.id === user.id)?.assigned_club_ids || []).includes(club.id)));
}
function findClub(id) { return clubs.find(c => c.id === Number(id)); }
function clubName(id) { return findClub(id)?.name || "Unknown club"; }
function eventById(id) { return events.find(e => e.id === Number(id)); }
function eventAttendanceCount(eventId) { return attendanceLogs.filter(a => a.event_id === eventId).length; }

app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "ClubConnect", storage: "persistent SQLite" }));

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password) return res.status(400).json({ error: "Name, email, and password are required." });
    if (password.length < 8) return res.status(400).json({ error: "Use a password with at least 8 characters." });
    const normalizedEmail = email.trim().toLowerCase();
    if (users.some(u => u.email === normalizedEmail)) return res.status(409).json({ error: "That email is already registered." });
    const passwordHash = await bcrypt.hash(password, 12);
    // Re-check after hashing to prevent two simultaneous signups using the same email.
    if (users.some(u => u.email === normalizedEmail)) return res.status(409).json({ error: "That email is already registered." });
    const user = { id: nextUserId++, full_name: fullName.trim(), email: normalizedEmail, password_hash: passwordHash, role: "student", assigned_club_ids: [], created_at: new Date().toISOString() };
    users.push(user);
    res.status(201).json({ token: createToken(user), user: publicUser(user) });
  } catch (error) { console.error(error); res.status(500).json({ error: "Could not create account." }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const user = users.find(u => u.email === String(req.body.email || "").trim().toLowerCase());
    if (!user || !(await bcrypt.compare(req.body.password || "", user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
    res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) { console.error(error); res.status(500).json({ error: "Could not log in." }); }
});
app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));

// Only an existing administrator can approve or reject requests.
app.get("/api/role-requests", requireAuth, (req, res) => {
  const visible = req.user.role === "admin"
    ? roleRequests
    : roleRequests.filter(r => r.user_id === req.user.id);
  res.json({ roleRequests: visible.map(r => {
    const requester = users.find(u => u.id === r.user_id);
    return {
      ...r,
      requester_name: requester?.full_name || "Unknown user",
      requester_email: requester?.email || "",
      club_name: r.club_id ? clubName(r.club_id) : "—",
      reviewer_name: users.find(u => u.id === r.reviewed_by)?.full_name || null
    };
  }).sort((a, b) => b.requested_at.localeCompare(a.requested_at)) });
});

app.post("/api/role-requests", requireAuth, requireRole("student"), (req, res) => {
  const requestedRole = String(req.body.requestedRole || "").trim().toLowerCase();
  const reason = String(req.body.reason || "").trim();
  const clubId = requestedRole === "officer" ? Number(req.body.clubId) : null;
  if (!["officer", "admin"].includes(requestedRole)) {
    return res.status(400).json({ error: "You may request Club Officer or Administrator." });
  }
  if (reason.length < 10) return res.status(400).json({ error: "Please provide a reason of at least 10 characters." });
  if (requestedRole === "officer" && (!clubId || !findClub(clubId))) {
    return res.status(400).json({ error: "Choose a valid club for the officer request." });
  }
  const duplicate = roleRequests.some(r => r.user_id === req.user.id && r.requested_role === requestedRole && r.club_id === clubId && r.status === "pending");
  if (duplicate) return res.status(409).json({ error: "You already have a pending request for this role and club." });
  const request = {
    id: nextRoleRequestId++, user_id: req.user.id, requested_role: requestedRole,
    club_id: clubId, reason, status: "pending", requested_at: new Date().toISOString(),
    reviewed_at: null, reviewed_by: null, reviewer_note: ""
  };
  roleRequests.push(request);
  res.status(201).json({ roleRequest: request, message: "Role request submitted for administrator review." });
});

app.patch("/api/role-requests/:id", requireAuth, requireRole("admin"), (req, res) => {
  const request = roleRequests.find(r => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: "Role request not found." });
  if (request.status !== "pending") return res.status(409).json({ error: "This request has already been reviewed." });
  const status = String(req.body.status || "").trim().toLowerCase();
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Choose approved or rejected." });
  const targetUser = users.find(u => u.id === request.user_id);
  if (!targetUser || targetUser.role !== "student") return res.status(409).json({ error: "This account is no longer eligible for a role change." });
  request.status = status;
  request.reviewed_at = new Date().toISOString();
  request.reviewed_by = req.user.id;
  request.reviewer_note = String(req.body.reviewerNote || "").trim().slice(0, 300);
  if (status === "approved") {
    targetUser.role = request.requested_role;
    if (request.requested_role === "officer" && request.club_id) {
      targetUser.assigned_club_ids ||= [];
      if (!targetUser.assigned_club_ids.includes(request.club_id)) targetUser.assigned_club_ids.push(request.club_id);
    }
  }
  res.json({ roleRequest: request, message: status === "approved" ? `Request approved. ${targetUser.full_name} is now ${request.requested_role === "admin" ? "an administrator" : "a club officer"}.` : "Role request rejected." });
});

app.get("/api/clubs", (_req, res) => res.json({ clubs: clubs.map(c => ({ ...c, member_count: memberships.filter(m => m.club_id === c.id && m.status === "approved").length })) }));
app.post("/api/clubs", requireAuth, requireRole("officer", "admin"), (req, res) => {
  const { name, category, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Club name is required." });
  const club = { id: nextClubId++, name: name.trim(), category: category?.trim() || "General", description: description?.trim() || "", created_by: req.user.id, created_at: new Date().toISOString() };
  clubs.push(club); res.status(201).json({ club: { ...club, member_count: 0 } });
});
app.post("/api/clubs/:id/join", requireAuth, requireRole("student"), (req, res) => {
  const club = findClub(req.params.id); if (!club) return res.status(404).json({ error: "Club not found." });
  let membership = memberships.find(m => m.club_id === club.id && m.user_id === req.user.id);
  if (membership) { membership.status = "pending"; membership.requested_at = new Date().toISOString(); }
  else { membership = { id: nextMembershipId++, user_id: req.user.id, club_id: club.id, status: "pending", requested_at: new Date().toISOString() }; memberships.push(membership); }
  res.status(201).json({ membership, message: "Membership request submitted." });
});
app.get("/api/memberships", requireAuth, (req, res) => {
  const visible = memberships.filter(m => req.user.role === "student" ? m.user_id === req.user.id : canManageClub(req.user, m.club_id));
  res.json({ memberships: visible.map(m => {
    const student = users.find(u => u.id === m.user_id);
    return { ...m, club_name: clubName(m.club_id), ...(req.user.role !== "student" ? { student_name: student?.full_name, email: student?.email } : {}) };
  }).sort((a,b) => b.requested_at.localeCompare(a.requested_at)) });
});
app.patch("/api/memberships/:id", requireAuth, requireRole("officer", "admin"), (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Status must be approved or rejected." });
  const membership = memberships.find(m => m.id === Number(req.params.id));
  if (!membership) return res.status(404).json({ error: "Membership request not found." });
  if (!canManageClub(req.user, membership.club_id)) return res.status(403).json({ error: "You cannot manage this club." });
  membership.status = status; res.json({ membership });
});

app.get("/api/events", (_req, res) => res.json({ events: events.map(e => ({ ...e, club_name: clubName(e.club_id), attendance_count: eventAttendanceCount(e.id) })).sort((a,b) => a.starts_at.localeCompare(b.starts_at)) }));
app.post("/api/events", requireAuth, requireRole("officer", "admin"), (req, res) => {
  const { clubId, title, description, location, startsAt } = req.body;
  if (!clubId || !title?.trim() || !startsAt) return res.status(400).json({ error: "Club, event title, and date/time are required." });
  if (!findClub(clubId)) return res.status(404).json({ error: "Club not found." });
  if (!canManageClub(req.user, Number(clubId))) return res.status(403).json({ error: "You can only create events for a club you manage." });
  const event = { id: nextEventId++, club_id: Number(clubId), title: title.trim(), description: description?.trim() || "", location: location?.trim() || "", starts_at: new Date(startsAt).toISOString(), created_by: req.user.id, qr_token: crypto.randomBytes(18).toString("hex"), created_at: new Date().toISOString() };
  events.push(event); res.status(201).json({ event: { ...event, club_name: clubName(event.club_id), attendance_count: 0 }, qrToken: event.qr_token });
});
app.get("/api/events/:id/qr", requireAuth, requireRole("officer", "admin"), async (req, res) => {
  try {
    const event = eventById(req.params.id); if (!event) return res.status(404).json({ error: "Event not found." });
    if (!canManageClub(req.user, event.club_id)) return res.status(403).json({ error: "You cannot manage this event." });
    const checkInUrl = `${req.protocol}://${req.get("host")}/?checkin=${encodeURIComponent(event.qr_token)}`;
    res.json({ qr: await QRCode.toDataURL(checkInUrl, { width: 300, margin: 2 }), checkInUrl });
  } catch (error) { console.error(error); res.status(500).json({ error: "Could not generate QR code." }); }
});
app.post("/api/attendance/checkin", requireAuth, requireRole("student"), (req, res) => {
  const event = events.find(e => e.qr_token === req.body.qrToken);
  if (!event) return res.status(404).json({ error: "This QR code is invalid." });
  const member = memberships.find(m => m.user_id === req.user.id && m.club_id === event.club_id && m.status === "approved");
  if (!member) return res.status(403).json({ error: "You must be an approved member of this club to check in." });
  if (attendanceLogs.some(a => a.event_id === event.id && a.user_id === req.user.id)) return res.status(409).json({ error: "You have already checked in to this event." });
  const attendance = { id: nextAttendanceId++, event_id: event.id, user_id: req.user.id, checked_in_at: new Date().toISOString() };
  attendanceLogs.push(attendance); res.status(201).json({ message: `Attendance confirmed for ${event.title}.`, attendance });
});
app.get("/api/attendance", requireAuth, (req, res) => {
  const visible = attendanceLogs.filter(a => req.user.role === "student" ? a.user_id === req.user.id : req.user.role === "admin" || canManageClub(req.user, events.find(e => e.id === a.event_id)?.club_id));
  res.json({ attendance: visible.map(a => {
    const event = eventById(a.event_id), user = users.find(u => u.id === a.user_id);
    return { id: a.id, checked_in_at: a.checked_in_at, event_title: event?.title || "Unknown event", starts_at: event?.starts_at || a.checked_in_at, club_name: clubName(event?.club_id), ...(req.user.role !== "student" ? { student_name: user?.full_name, email: user?.email } : {}) };
  }).sort((a,b) => b.checked_in_at.localeCompare(a.checked_in_at)) });
});
app.get("/api/admin/summary", requireAuth, requireRole("admin"), (_req, res) => res.json({ users: users.length, clubs: clubs.length, events: events.length, attendance: attendanceLogs.length }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

async function start() {
  loadDatabase();
  // Optional first-admin bootstrap. Configure these values privately in the deployment environment.
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  if (adminEmail && adminPassword && !users.some(u => u.email === adminEmail) && !users.some(u => u.role === "admin")) {
    if (adminPassword.length < 12) throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
    const admin = { id: nextUserId++, full_name: String(process.env.ADMIN_NAME || "System Administrator").trim(), email: adminEmail, password_hash: await bcrypt.hash(adminPassword, 12), role: "admin", assigned_club_ids: [], created_at: new Date().toISOString() };
    users.push(admin);
    saveDatabase();
    console.log("Initial administrator account created.");
  }
  app.listen(port, () => console.log(`ClubConnect running at http://localhost:${port}\nSQLite database: ${databasePath}`));
}
start().catch(error => { console.error("Unable to start ClubConnect:", error); process.exit(1); });
