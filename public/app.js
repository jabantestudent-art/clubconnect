const $ = (selector) => document.querySelector(selector);
const state = { token: localStorage.getItem("cc_token"), user: null, page: "overview", clubs: [], events: [], memberships: [], attendance: [], roleRequests: [], lastQrToken: null };

const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const dateText = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Date not set";
const roleLabel = (role) => role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
const iconFor = (name = "") => ({technology:"⌘",sports:"⚽",arts:"✦",academic:"▤",volunteer:"♡",general:"♧"}[name.toLowerCase()] || "♧");

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function showMessage(text, isError = false, target = "#notice") {
  const box = $(target);
  if (!box) return;
  box.textContent = text;
  box.classList.remove("hidden", "error");
  if (isError) box.classList.add("error");
}
function hideMessage(target = "#notice") { $(target)?.classList.add("hidden"); }

function showAuth(tab = "login", message = "") {
  $("#auth-view").classList.remove("hidden");
  $("#app-view").classList.add("hidden");
  $("#account").textContent = "STUDENT COMMUNITY";
  $("#logout-btn")?.classList.add("hidden");
  document.querySelectorAll("[data-auth-tab]").forEach(b => b.classList.toggle("active", b.dataset.authTab === tab));
  $("#login-form").classList.toggle("hidden", tab !== "login");
  $("#signup-form").classList.toggle("hidden", tab !== "signup");
  if (message) showMessage(message, true, "#auth-message");
  else hideMessage("#auth-message");
}

function showApp() {
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  $("#account").textContent = `${state.user.name} · ${roleLabel(state.user.role)}`;
  $("#logout-btn")?.classList.remove("hidden");
  $("#side-name").textContent = state.user.name;
  $("#side-role").textContent = state.user.role;
  $("#side-avatar").textContent = state.user.name.trim().charAt(0).toUpperCase();
  $("#role-requests-link").classList.toggle("hidden", state.user.role !== "student");
  $("#role-approvals-link").classList.toggle("hidden", state.user.role !== "admin");
}

async function loadData() {
  const [clubs, events, memberships, attendance, roleRequests] = await Promise.all([
    api("/api/clubs"), api("/api/events"), api("/api/memberships"), api("/api/attendance"), api("/api/role-requests")
  ]);
  state.clubs = clubs.clubs;
  state.events = events.events;
  state.memberships = memberships.memberships;
  state.attendance = attendance.attendance;
  state.roleRequests = roleRequests.roleRequests;
  renderPage();
}

function statCard(label, value, note) {
  return `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-number">${esc(value)}</div><div class="stat-note">${esc(note)}</div></div>`;
}
function clubCards(clubs, actions = true) {
  if (!clubs.length) return `<div class="empty">No clubs have been added yet.</div>`;
  return `<div class="cards">${clubs.map(c => {
    const membership = state.memberships.find(m => m.club_name === c.name);
    const button = state.user.role === "student" ? (membership ? `<span class="status ${esc(membership.status)}">${esc(membership.status)}</span>` : `<button class="btn primary" data-join="${c.id}">Request to join →</button>`) : "";
    return `<article class="club-card"><div class="club-icon">${iconFor(c.category)}</div><span class="tag">${esc(c.category)}</span><h3>${esc(c.name)}</h3><p>${esc(c.description || "A campus community for students to connect and participate.")}</p><p>♙ ${c.member_count || 0} approved members</p>${actions ? button : ""}</article>`;
  }).join("")}</div>`;
}
function eventCards(events) {
  if (!events.length) return `<div class="empty">No events yet. Check back soon.</div>`;
  return `<div class="event-list">${events.map(e => `<article class="event-card"><span class="tag">${esc(e.club_name)}</span><h3>${esc(e.title)}</h3><p>${esc(e.description || "Join this campus activity and connect with other students.")}</p><div class="event-meta"><span>◷ ${esc(dateText(e.starts_at))}</span><span>⌖ ${esc(e.location || "Location to be announced")}</span><span>✓ ${e.attendance_count || 0} check-ins</span></div>${state.user.role === "student" ? `<button class="btn secondary" data-copy-event="${e.id}">I have a QR code</button>` : ""}</article>`).join("")}</div>`;
}
function table(headers, rows) {
  if (!rows.length) return `<div class="empty">Nothing to show yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
function statusTag(status) { return `<span class="status ${esc(status)}">${esc(status)}</span>`; }

function renderPage() {
  const page = state.page;
  document.querySelectorAll(".side-link").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const titles = {
    overview:["Overview","Your campus community at a glance."],
    clubs:["Discover clubs","Find a community and get involved."],
    events:["Campus events","See what is happening across your clubs."],
    memberships:["Membership requests","Track or manage club membership applications."],
    attendance:["Attendance records","Review verified participation records."],
    "role-requests":["Request a role","Request Club Officer or Administrator access."],
    "role-approvals":["Role approvals","Review student requests and assign permissions safely."]
  };
  if (!titles[page]) state.page = "overview";
  $("#page-title").textContent = titles[state.page][0];
  $("#page-subtitle").textContent = titles[state.page][1];
  hideMessage();
  const isStudent = state.user.role === "student";
  const isAdmin = state.user.role === "admin";
  let html = "";

  if (page === "overview") {
    html += `<div class="stats">
      ${statCard("Available clubs", state.clubs.length, "Campus communities")}
      ${statCard("Upcoming events", state.events.filter(e => new Date(e.starts_at) >= new Date()).length, "Activities to explore")}
      ${statCard(isStudent ? "My memberships" : "Membership requests", state.memberships.length, isStudent ? "Your club applications" : "Requests in your clubs")}
      ${statCard("Attendance records", state.attendance.length, "Verified check-ins")}
    </div>`;
    if (isAdmin) {
      html += `<div class="panel"><h2>Administrator tools</h2><p>Review all campus clubs, membership requests, and attendance records. Admin accounts must be assigned by a database administrator.</p><button class="btn secondary" data-page-jump="memberships">Review memberships</button> <button class="btn secondary" data-page-jump="attendance">View attendance</button></div>`;
    } else if (state.user.role === "officer") {
      html += `<div class="panel"><h2>Officer workspace</h2><p>Create your club first, then add events and approve student membership requests for clubs assigned to your account.</p><button class="btn primary" data-page-jump="clubs">Manage clubs</button> <button class="btn secondary" data-page-jump="memberships">Review requests</button></div>`;
    } else {
      html += `<div class="section-title"><h2>Explore campus clubs</h2><button class="btn secondary" data-page-jump="clubs">View all clubs →</button></div>${clubCards(state.clubs.slice(0,3))}`;
      html += `<div class="section-title"><h2>Upcoming events</h2><button class="btn secondary" data-page-jump="events">View events →</button></div>${eventCards(state.events.filter(e => new Date(e.starts_at) >= new Date()).slice(0,2))}`;
    }
  }

  if (page === "clubs") {
    if (["officer","admin"].includes(state.user.role)) {
      html += `<div class="panel" style="margin-bottom:18px"><h2>Create a club</h2><p>Officers can create clubs they manage. Admins can create campus clubs too.</p>
      <form id="club-form"><div class="form-row"><label class="field">Club name<input name="name" required placeholder="Enter club name"></label><label class="field">Category<select name="category"><option>Academic</option><option>Technology</option><option>Arts</option><option>Sports</option><option>Volunteer</option><option>General</option></select></label></div><label class="field">Description<textarea name="description" placeholder="What is this club about?"></textarea></label><button class="btn primary">Create club</button></form></div>`;
    }
    html += `<div class="section-title"><h2>Registered clubs</h2><span class="tag">${state.clubs.length} total</span></div>${clubCards(state.clubs)}`;
  }

  if (page === "events") {
    if (["officer","admin"].includes(state.user.role)) {
      const ownClubs = state.user.role === "admin" ? state.clubs : state.clubs.filter(c => c.created_by === state.user.id || (state.user.assigned_club_ids || []).includes(c.id));
      // Ownership is enforced by the API; if no clubs are owned, create a club first.
      html += `<div class="panel" style="margin-bottom:18px"><h2>Create an event</h2><p>Choose a club you manage and enter the event date and time.</p>
      ${ownClubs.length ? `<form id="event-form"><label class="field">Club<select name="clubId" required>${ownClubs.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><label class="field">Event title<input name="title" required placeholder="Enter event title"></label><label class="field">Description<textarea name="description" placeholder="Tell students about the event"></textarea></label><div class="form-row"><label class="field">Location<input name="location" placeholder="Enter event location"></label><label class="field">Date and time<input name="startsAt" type="datetime-local" required></label></div><button class="btn primary">Publish event</button></form>` : `<p>Create a club first, then you can publish an event for it.</p><button class="btn secondary" data-page-jump="clubs">Create a club</button>`}</div>`;
    }
    html += `<div class="section-title"><h2>All events</h2><span class="tag">${state.events.length} total</span></div>${eventCards(state.events)}`;
    const params = new URLSearchParams(location.search);
    if (params.has("checkin")) {
      html += `<div class="panel" style="margin-top:18px"><h2>QR check-in</h2><p>You're opening a check-in link. Confirm attendance for the event if you are an approved member.</p><button class="btn primary" id="checkin-btn" data-token="${esc(params.get("checkin"))}">Confirm my attendance</button></div>`;
    }
  }

  if (page === "memberships") {
    if (isStudent) {
      html += table(["Club","Requested","Status"], state.memberships.map(m => `<tr><td>${esc(m.club_name)}</td><td>${esc(dateText(m.requested_at))}</td><td>${statusTag(m.status)}</td></tr>`));
    } else {
      html += table(["Student","Email","Club","Requested","Status","Action"], state.memberships.map(m => `<tr><td>${esc(m.student_name || "")}</td><td>${esc(m.email || "")}</td><td>${esc(m.club_name)}</td><td>${esc(dateText(m.requested_at))}</td><td>${statusTag(m.status)}</td><td>${m.status === "pending" ? `<button class="btn primary" data-membership="${m.id}" data-status="approved">Approve</button> <button class="btn danger" data-membership="${m.id}" data-status="rejected">Reject</button>` : "—"}</td></tr>`));
    }
  }

  if (page === "attendance") {
    if (!isStudent) {
      html += `<div class="panel" style="margin-bottom:17px"><h2>Event QR codes</h2><p>Choose an event you manage to generate a QR code. Students must be approved club members to check in.</p><div class="field"><label for="qr-event">Event</label><select id="qr-event">${state.events.map(e => `<option value="${e.id}">${esc(e.title)} — ${esc(e.club_name)}</option>`).join("")}</select></div><button id="generate-qr" class="btn primary" ${state.events.length ? "" : "disabled"}>Generate QR code</button><div id="qr-output"></div></div>`;
    } else {
      html += `<div class="panel" style="margin-bottom:17px"><h2>Check in with a QR code</h2><p>Scan an event QR code with your phone camera. If the QR code opens a ClubConnect link, log in and confirm attendance.</p><label class="field">Or paste the check-in token / link<input id="qr-token-input" placeholder="Paste QR token or check-in URL"></label><button id="manual-checkin" class="btn primary">Confirm attendance</button></div>`;
    }
    html += table(isStudent ? ["Event","Club","Event date","Checked in"] : ["Student","Email","Event","Club","Checked in"], state.attendance.map(a => isStudent
      ? `<tr><td>${esc(a.event_title)}</td><td>${esc(a.club_name)}</td><td>${esc(dateText(a.starts_at))}</td><td>${esc(dateText(a.checked_in_at))}</td></tr>`
      : `<tr><td>${esc(a.student_name || "")}</td><td>${esc(a.email || "")}</td><td>${esc(a.event_title)}</td><td>${esc(a.club_name)}</td><td>${esc(dateText(a.checked_in_at))}</td></tr>`));
  }

  if (page === "role-requests" && isStudent) {
    const pending = state.roleRequests.some(r => r.status === "pending");
    html += `<div class="panel" style="margin-bottom:18px"><h2>Request additional permissions</h2><p>All role requests are reviewed by an existing administrator. A request does not change your role until it is approved. Administrator access should only be requested when there is a genuine system-management need.</p>
      <form id="role-request-form"><label class="field">Requested role<select name="requestedRole" id="requested-role" required><option value="officer">Club Officer</option><option value="admin">Administrator</option></select></label>
      <label class="field" id="role-club-field">Club<select name="clubId" id="role-club" required>${state.clubs.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
      <label class="field">Reason for request<textarea name="reason" minlength="10" required placeholder="Explain why you need this role (at least 10 characters)."></textarea></label>
      <button class="btn primary" ${pending ? "disabled" : ""}>Submit role request</button>${pending ? `<p class="tiny">You already have a pending request. Wait for the administrator to review it.</p>` : ""}</form></div>`;
    html += `<div class="section-title"><h2>My role requests</h2><span class="tag">${state.roleRequests.length} total</span></div>`;
    html += table(["Requested role","Club","Reason","Submitted","Status","Review note"], state.roleRequests.map(r => `<tr><td>${esc(roleLabel(r.requested_role))}</td><td>${esc(r.club_name)}</td><td>${esc(r.reason)}</td><td>${esc(dateText(r.requested_at))}</td><td>${statusTag(r.status)}</td><td>${esc(r.reviewer_note || "—")}</td></tr>`));
  }

  if (page === "role-approvals" && isAdmin) {
    html += `<div class="panel" style="margin-bottom:18px"><h2>Administrator review</h2><p>Only an existing administrator can approve these requests. Approving a Club Officer request grants access to the selected club; approving an Administrator request grants system-wide permissions.</p></div>`;
    html += table(["Student","Email","Requested role","Club","Reason","Submitted","Status","Action"], state.roleRequests.map(r => `<tr><td>${esc(r.requester_name)}</td><td>${esc(r.requester_email)}</td><td>${esc(roleLabel(r.requested_role))}</td><td>${esc(r.club_name)}</td><td>${esc(r.reason)}</td><td>${esc(dateText(r.requested_at))}</td><td>${statusTag(r.status)}</td><td>${r.status === "pending" ? `<button class="btn primary" data-role-request="${r.id}" data-status="approved">Approve</button> <button class="btn danger" data-role-request="${r.id}" data-status="rejected">Reject</button>` : esc(r.reviewer_name ? `Reviewed by ${r.reviewer_name}` : "Reviewed")}</td></tr>`));
  }

  $("#page-content").innerHTML = html;
}

async function refresh() {
  try {
    if (!state.token) return showAuth();
    const me = await api("/api/me");
    state.user = me.user;
    showApp();
    await loadData();
  } catch (error) {
    localStorage.removeItem("cc_token"); state.token = null; state.user = null; showAuth("login", error.message);
  }
}

document.addEventListener("click", async (event) => {
  if (event.target.closest("#logout-btn")) {
    if (!confirm("Log out of ClubConnect?")) return;
    localStorage.removeItem("cc_token");
    state.token = null; state.user = null; state.page = "overview";
    showAuth("login");
    return;
  }
  const authTab = event.target.closest("[data-auth-tab]");
  if (authTab) return showAuth(authTab.dataset.authTab);
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) { state.page = pageButton.dataset.page; return renderPage(); }
  const jump = event.target.closest("[data-page-jump]");
  if (jump) { state.page = jump.dataset.pageJump; return renderPage(); }
  const join = event.target.closest("[data-join]");
  if (join) {
    try { const result = await api(`/api/clubs/${join.dataset.join}/join`, { method:"POST", body:JSON.stringify({}) }); showMessage(result.message); await loadData(); }
    catch (e) { showMessage(e.message, true); }
  }
  const membership = event.target.closest("[data-membership]");
  if (membership) {
    try { await api(`/api/memberships/${membership.dataset.membership}`, { method:"PATCH", body:JSON.stringify({status:membership.dataset.status}) }); showMessage(`Request ${membership.dataset.status}.`); await loadData(); }
    catch (e) { showMessage(e.message, true); }
  }
  const roleRequest = event.target.closest("[data-role-request]");
  if (roleRequest) {
    const action = roleRequest.dataset.status;
    if (!confirm(`${action === "approved" ? "Approve" : "Reject"} this role request?`)) return;
    try {
      const result = await api(`/api/role-requests/${roleRequest.dataset.roleRequest}`, { method:"PATCH", body:JSON.stringify({status:action}) });
      showMessage(result.message);
      await refresh();
    } catch (e) { showMessage(e.message, true); }
  }
  const generate = event.target.closest("#generate-qr");
  if (generate) {
    try {
      const result = await api(`/api/events/${$("#qr-event").value}/qr`);
      $("#qr-output").innerHTML = `<img class="qr-preview" alt="Event attendance QR code" src="${result.qr}"><p class="small-link">${esc(result.checkInUrl)}</p>`;
    } catch (e) { showMessage(e.message, true); }
  }
  const checkin = event.target.closest("#checkin-btn");
  if (checkin) await submitCheckin(checkin.dataset.token);
  if (event.target.closest("#manual-checkin")) {
    const input = $("#qr-token-input").value.trim();
    const match = input.match(/[?&]checkin=([^&]+)/);
    await submitCheckin(match ? decodeURIComponent(match[1]) : input);
  }
  if (event.target.closest("#refresh-btn")) await loadData().catch(e => showMessage(e.message, true));
});

async function submitCheckin(token) {
  if (!token) return showMessage("Enter or scan a valid QR token.", true);
  try {
    const result = await api("/api/attendance/checkin", { method:"POST", body:JSON.stringify({qrToken:token}) });
    showMessage(result.message); await loadData();
  } catch (e) { showMessage(e.message, true); }
}

document.addEventListener("change", (event) => {
  if (event.target.id === "requested-role") {
    const officer = event.target.value === "officer";
    $("#role-club-field")?.classList.toggle("hidden", !officer);
    const clubSelect = $("#role-club");
    if (clubSelect) clubSelect.required = officer;
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "login-form" || event.target.id === "signup-form") {
    event.preventDefault();
    const form = event.target;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const endpoint = form.id === "login-form" ? "/api/auth/login" : "/api/auth/signup";
      const result = await api(endpoint, { method:"POST", body:JSON.stringify(payload) });
      state.token = result.token; state.user = result.user;
      localStorage.setItem("cc_token", result.token);
      history.replaceState({}, "", location.pathname);
      state.page = "overview"; await refresh();
    } catch (e) { showMessage(e.message, true, "#auth-message"); }
  }

  if (event.target.id === "role-request-form") {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(event.target).entries());
      payload.clubId = payload.requestedRole === "officer" ? Number(payload.clubId) : null;
      const result = await api("/api/role-requests", { method:"POST", body:JSON.stringify(payload) });
      showMessage(result.message);
      await loadData();
    } catch (e) { showMessage(e.message, true); }
  }

  if (event.target.id === "club-form") {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(event.target).entries());
      await api("/api/clubs", { method:"POST", body:JSON.stringify(payload) });
      showMessage("Club created successfully."); await loadData();
    } catch (e) { showMessage(e.message, true); }
  }

  if (event.target.id === "event-form") {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(event.target).entries());
      payload.clubId = Number(payload.clubId);
      await api("/api/events", { method:"POST", body:JSON.stringify(payload) });
      showMessage("Event published successfully."); await loadData();
    } catch (e) { showMessage(e.message, true); }
  }
});

const checkinToken = new URLSearchParams(location.search).get("checkin");
if (checkinToken) state.page = "events";
refresh().then(() => { if (checkinToken && state.user) { state.page = "events"; renderPage(); } });
