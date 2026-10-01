// =====================================================
// CareMate · script.js
// Plain JavaScript. No frameworks, no build step.
// =====================================================

// 1) Your n8n webhook URL, through your Cloudflare Tunnel.
// Replace YOUR-TUNNEL-NAME with the name cloudflared prints when it starts.
// Quick tunnels (trycloudflare.com) get a NEW address every time you restart them,
// so update this line whenever that happens.
// The n8n workflow must be Active to use /webhook/ (use /webhook-test/ while testing).
const WEBHOOK_URL = "https://revolution-broker-window-options.trycloudflare.com/webhook/caremate-process";

// 2) Application state. n8n's response fills this in.
const state = {
  data: {
    dashboard: {},
    timeline: [],
    documents: [],
    appointments: [],
    follow_ups: [],
    doctor_briefing: {}
  }
};

let lastFile = null; // remembered so "Try Again" can resend it

// Short helper to grab elements by id
const $ = (id) => document.getElementById(id);


// =====================================================
// Small helpers
// =====================================================

// Escapes text so nothing from the backend can break the page
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Draws one of the icons defined at the top of index.html
function icon(id) {
  return `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
}

// Friendly message shown when a section has nothing to display
function emptyState(title, sub, iconId = "i-doc", compact = false) {
  return `
    <div class="empty ${compact ? "compact" : ""}">
      <span class="empty-icon">${icon(iconId)}</span>
      <strong>${esc(title)}</strong>
      <span class="sub">${esc(sub)}</span>
    </div>`;
}

// Greeting from n8n if provided, otherwise based on the time of day
function getGreeting() {
  const fromBackend = state.data.dashboard && state.data.dashboard.greeting;
  if (fromBackend) return fromBackend;
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Briefing lists may contain plain strings or objects. Handle both.
function toItem(entry) {
  if (typeof entry === "string") return { title: entry, sub: "" };
  const title = entry.title || entry.name || entry.event || entry.item || "";
  const sub = entry.description || entry.reason || entry.date || "";
  return { title, sub };
}


// =====================================================
// Page switching: landing page <-> dashboard
// =====================================================

function showLandingPage() {
  $("dashboard-page").classList.add("hidden");
  $("landing-page").classList.remove("hidden");
  document.body.classList.remove("in-dashboard");
  window.scrollTo(0, 0);
}

function showDashboard() {
  $("landing-page").classList.add("hidden");
  $("dashboard-page").classList.remove("hidden");
  document.body.classList.add("in-dashboard");
  window.scrollTo(0, 0);
  renderAll();
  showView("dashboard");
}

// Titles shown in the dashboard header for each view
const viewTitles = {
  timeline:     ["Timeline", "Your healthcare events, in order."],
  documents:    ["Documents", "Everything you've uploaded."],
  appointments: ["Appointments", "Appointments found in your documents."],
  followups:    ["Follow-ups", "Tasks to keep track of."],
  briefing:     ["Doctor Briefing", "A summary to share with your healthcare professional."]
};

function showView(name) {
  // Show only the chosen view
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("view-" + name).classList.add("active");

  // Highlight the matching sidebar link
  document.querySelectorAll(".side-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });

  // Update header text
  if (name === "dashboard") {
    $("page-title").textContent = getGreeting() + " 👋";
    $("page-subtitle").textContent = state.data.dashboard.subtext || "Here's your care overview.";
  } else {
    $("page-title").textContent = viewTitles[name][0];
    $("page-subtitle").textContent = viewTitles[name][1];
  }

  closeSidebar();
  window.scrollTo(0, 0);
}


// =====================================================
// Rendering. Each function fills one part of the page
// from state.data.
// =====================================================

function renderAll() {
  renderDashboard();
  renderTimeline();
  renderDocuments();
  renderAppointments();
  renderFollowUps();
  renderDoctorBriefing();
}

// ---------- Dashboard ----------
function renderDashboard() {
  const d = state.data.dashboard || {};
  const docs = state.data.documents || [];
  const tasks = state.data.follow_ups || [];

  // Numbers
  $("stat-reports").textContent   = d.total_reports ?? docs.length;
  $("stat-upcoming").textContent  = d.upcoming_appointments_count ?? 0;
  $("stat-followups").textContent = d.follow_ups_count ?? tasks.length;

  // Header text (only if the dashboard is the open view)
  if ($("view-dashboard").classList.contains("active")) {
    $("page-title").textContent = getGreeting() + " 👋";
    $("page-subtitle").textContent = d.subtext || "Here's your care overview.";
  }

  // Upcoming appointment
  const next = d.next_appointment;
  $("dash-appointment").innerHTML = next && next.doctor_name
    ? `<div class="appt-mini">
         <span class="appt-date-box">${icon("i-calendar")}</span>
         <div>
           <strong>${esc(next.doctor_name)}</strong>
           <span>${esc(next.date)}</span>
           <span>${esc(next.time)}</span>
         </div>
       </div>`
    : emptyState("No upcoming appointments found.", "", "i-calendar", true);

  // Recent documents (latest 3)
  $("dash-documents").innerHTML = docs.length
    ? `<div class="item-list">${docs.slice(0, 3).map(documentRow).join("")}</div>`
    : emptyState("No documents yet", "Upload a medical report, prescription or clinical note to get started.", "i-doc");

  // Follow-up tasks (first 4)
  $("dash-followups").innerHTML = tasks.length
    ? `<div class="item-list">${tasks.slice(0, 4).map(taskRow).join("")}</div>`
    : emptyState("No follow-up tasks identified.", "", "i-tasks", true);
}

// One row in a document list
function documentRow(doc) {
  const status = doc.status || "Ready";
  const meta = [doc.type, doc.date].filter(Boolean).join(" · ");
  return `
    <div class="item">
      <span class="item-icon">${icon("i-doc")}</span>
      <div class="item-body">
        <strong>${esc(doc.name)}</strong>
        <span>${esc(meta)}</span>
      </div>
      <span class="pill pill-${esc(status.toLowerCase().replace(/\s+/g, "-"))}">${esc(status)}</span>
    </div>`;
}

// One row in a task list
function taskRow(task) {
  const status = task.status || "Pending";
  return `
    <div class="item">
      <span class="item-icon">${icon("i-tasks")}</span>
      <div class="item-body">
        <strong>${esc(task.title)}</strong>
        <span>${task.due_date ? "Due: " + esc(task.due_date) : ""}</span>
      </div>
      <span class="pill pill-${esc(status.toLowerCase().replace(/\s+/g, "-"))}">${esc(status)}</span>
    </div>`;
}

// ---------- Timeline ----------
function renderTimeline() {
  const items = state.data.timeline || [];

  if (!items.length) {
    $("timeline-list").innerHTML = emptyState(
      "Your timeline will appear here after your documents are processed.",
      "", "i-timeline"
    );
    return;
  }

  $("timeline-list").innerHTML = `<div class="timeline">${items.map((item) => {
    const isAssumption = String(item.badge).toUpperCase() === "ASSUMPTION";

    // Never hide uncertainty: assumptions always show a reason box
    const reason = isAssumption
      ? `<div class="flag-reason">
           <strong>Why this was flagged</strong>
           ${esc(item.flag_reason || "No reason was provided. Please confirm with your healthcare professional.")}
         </div>`
      : "";

    return `
      <div class="tl-item ${isAssumption ? "assumption" : "fact"}">
        <span class="tl-dot"></span>
        <div class="tl-date">${esc(item.date)}</div>
        <div class="tl-box">
          <div class="tl-title-row">
            <h3>${esc(item.title)}</h3>
            <span class="badge ${isAssumption ? "badge-assumption" : "badge-fact"}">${isAssumption ? "ASSUMPTION" : "FACT"}</span>
          </div>
          ${item.description ? `<p>${esc(item.description)}</p>` : ""}
          ${reason}
        </div>
      </div>`;
  }).join("")}</div>`;
}

// ---------- Documents ----------
function renderDocuments() {
  const docs = state.data.documents || [];
  $("documents-list").innerHTML = docs.length
    ? `<div class="item-list">${docs.map(documentRow).join("")}</div>`
    : emptyState("No documents yet", "Upload a medical report, prescription or clinical note to get started.", "i-doc");
}

// ---------- Appointments ----------
// Optional fields n8n can send per appointment:
//   specialty: "General Medicine"
//   preparation: [ { "label": "Blood Test Report", "status": "ready" }, ... ]
//   (status "missing" or "pending" shows a warning instead of a tick)
function renderAppointments() {
  const list = state.data.appointments || [];

  if (!list.length) {
    $("appointments-list").innerHTML = `<div class="card">${emptyState("No upcoming appointments found.", "", "i-calendar")}</div>`;
    return;
  }

  $("appointments-list").innerHTML = list.map((a) => {
    const status = a.status || "Upcoming";

    const prep = (a.preparation && a.preparation.length)
      ? `<div class="prep">
           <h3>Preparation</h3>
           <ul>${a.preparation.map((p) => {
             const label = typeof p === "string" ? p : p.label;
             const st = typeof p === "string" ? "ready" : String(p.status || "ready").toLowerCase();
             const missing = st === "missing" || st === "pending";
             return `<li class="${missing ? "missing" : "ok"}">${icon(missing ? "i-warn" : "i-check")} ${esc(label)}</li>`;
           }).join("")}</ul>
         </div>`
      : "";

    return `
      <article class="card appt-card">
        <div class="appt-top">
          <div>
            <div class="appt-doctor">${esc(a.doctor_name)}</div>
            ${a.specialty ? `<div class="appt-spec">${esc(a.specialty)}</div>` : ""}
          </div>
          <span class="pill pill-${esc(status.toLowerCase().replace(/\s+/g, "-"))}">${esc(status)}</span>
        </div>
        <div class="appt-meta">
          <div><strong>Date</strong><span>${esc(a.date)}</span></div>
          <div><strong>Time</strong><span>${esc(a.time)}</span></div>
          ${a.type ? `<div><strong>Visit</strong><span>${esc(a.type)}</span></div>` : ""}
        </div>
        ${prep}
      </article>`;
  }).join("");
}

// ---------- Follow-ups ----------
function renderFollowUps() {
  const tasks = state.data.follow_ups || [];
  $("followups-list").innerHTML = tasks.length
    ? `<div class="item-list">${tasks.map(taskRow).join("")}</div>`
    : emptyState("No follow-up tasks identified.", "", "i-tasks");
}

// ---------- Doctor briefing ----------
function renderDoctorBriefing() {
  const b = state.data.doctor_briefing || {};
  const events = b.key_events || [];
  const docs = b.documents_available || [];
  const confirm = b.items_needing_confirmation || [];

  // Nothing yet
  if (!b.summary && !events.length && !docs.length && !confirm.length) {
    $("briefing-content").innerHTML = `<div class="card">${emptyState(
      "Your briefing will appear after documents are processed.", "", "i-briefing"
    )}</div>`;
    return;
  }

  // Turns an array into a bullet list (or a short "nothing" line)
  const bullets = (arr, cls, emptyText) => arr.length
    ? `<ul class="bullet-list ${cls || ""}">${arr.map((x) => {
        const it = toItem(x);
        return `<li>${esc(it.title)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</li>`;
      }).join("")}</ul>`
    : `<p>${emptyText}</p>`;

  $("briefing-content").innerHTML = `
    <div class="card brief-card">
      <h2>Patient Overview</h2>
      <p>${esc(b.summary || "No overview available.")}</p>
    </div>
    <div class="card brief-card">
      <h2>Key Events</h2>
      ${bullets(events, "", "No key events listed.")}
    </div>
    <div class="card brief-card">
      <h2>Available Documents</h2>
      ${bullets(docs, "", "No documents listed.")}
    </div>
    <div class="card brief-card">
      <h2>Items Needing Confirmation</h2>
      ${bullets(confirm, "confirm", "Nothing needs confirmation.")}
    </div>
    <div class="brief-note">
      ${icon("i-eye")}
      <span>This summary is generated from uploaded information and should be reviewed by a healthcare professional.</span>
    </div>`;
}


// =====================================================
// Upload + n8n
// =====================================================

// Shows one of: "idle", "processing", "error"
function setUploadState(name) {
  $("upload-idle").classList.toggle("hidden", name !== "idle");
  $("upload-processing").classList.toggle("hidden", name !== "processing");
  $("upload-error").classList.toggle("hidden", name !== "error");
}

// Sends one file to the n8n webhook and returns the JSON it answers with.
// Errors are thrown (not swallowed) so uploadDocument can show the friendly error card.
async function uploadToBackend(file) {
  // 1. FormData carries the binary file (arrives in n8n as binary field "file")
  const formData = new FormData();
  formData.append("file", file);
  formData.append("filename", file.name);

  // 2. Call the n8n webhook (no Content-Type header: the browser sets multipart for us)
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  // 3. Receive the complete JSON payload from the workflow
  const result = await response.json();
  console.log("n8n Processing Complete:", result);
  return result;
}

// Sends the file to n8n and updates the page with the answer
async function uploadDocument(file) {
  lastFile = file;
  setUploadState("processing");

  try {
    if (!WEBHOOK_URL || WEBHOOK_URL.includes("YOUR-TUNNEL-NAME")) {
      throw new Error("WEBHOOK_URL is not set in script.js");
    }

    const json = await uploadToBackend(file);
    handleWebhookResponse(json);
    setUploadState("idle");

  } catch (error) {
    // Technical details go to the console only, never to the patient
    console.error("CareMate upload failed:", error);
    setUploadState("error");
  }
}

// Checks n8n's answer, saves it to state, and redraws everything
function handleWebhookResponse(json) {
  // n8n sometimes wraps the answer in an array
  if (Array.isArray(json)) json = json[0];

  if (!json || !json.data) {
    throw new Error("Response is missing the 'data' object");
  }

  // state.data = response.data (missing sections fall back to empty ones)
  state.data = {
    dashboard: {},
    timeline: [],
    documents: [],
    appointments: [],
    follow_ups: [],
    doctor_briefing: {},
    ...json.data
  };

  renderAll();
}

// Checks the chosen file is a PDF, PNG or JPG
function isSupportedFile(file) {
  const okTypes = ["application/pdf", "image/png", "image/jpeg"];
  const okExt = /\.(pdf|png|jpe?g)$/i.test(file.name);
  return okTypes.includes(file.type) || okExt;
}

function onFileChosen(event) {
  const file = event.target.files[0];
  event.target.value = ""; // lets the same file be picked again later
  if (!file) return;

  showView("dashboard"); // the processing message lives on the dashboard

  if (!isSupportedFile(file)) {
    console.error("Unsupported file type:", file.type || file.name);
    lastFile = null;
    setUploadState("error");
    return;
  }
  uploadDocument(file);
}


// =====================================================
// Sidebar (mobile) + landing menu (mobile)
// =====================================================

function openSidebar() {
  $("sidebar").classList.add("open");
  $("sidebar-backdrop").classList.add("show");
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebar-backdrop").classList.remove("show");
}


// =====================================================
// Wire everything up
// =====================================================

// All "Get Started" and "Sign In" buttons open the dashboard
document.querySelectorAll(".js-get-started").forEach((el) => {
  el.addEventListener("click", (e) => { e.preventDefault(); showDashboard(); });
});

// Dashboard sidebar links
document.querySelectorAll(".side-link").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.goto));
});

// Back to the landing page
$("back-to-landing").addEventListener("click", showLandingPage);
$("brand-home").addEventListener("click", (e) => { e.preventDefault(); showLandingPage(); });

// Mobile sidebar
$("menu-btn").addEventListener("click", openSidebar);
$("sidebar-backdrop").addEventListener("click", closeSidebar);

// Upload buttons
$("upload-btn").addEventListener("click", () => $("file-input").click());
$("upload-btn-2").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", onFileChosen);

// Try Again: resend the same file, or pick a new one
$("retry-btn").addEventListener("click", () => {
  if (lastFile) uploadDocument(lastFile);
  else $("file-input").click();
});

// Landing page mobile menu
$("nav-toggle").addEventListener("click", () => {
  const open = $("nav-links").classList.toggle("open");
  $("nav-toggle").setAttribute("aria-expanded", open);
});
document.querySelectorAll("#nav-links a").forEach((a) => {
  a.addEventListener("click", () => {
    $("nav-links").classList.remove("open");
    $("nav-toggle").setAttribute("aria-expanded", "false");
  });
});

// Draw the empty states on first load
renderAll();