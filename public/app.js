const app = document.querySelector("#app"),
  dialog = document.querySelector("#dialog");
let salon,
  clientView,
  filter = "all",
  lastSignature = "",
  busy = false,
  offset = 0,
  connectionError = "",
  refreshing = false;
const excluded = new Map();
const consent = new Set();
const reviewedSnapshots = new Map();
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const now = () => Date.now() + offset;
const tz = "America/Los_Angeles";
const date = (value) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(value);
const time = (value) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
const initials = (name) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
const client = (id) => salon.clients.find((c) => c.id === id);
const names = {
  review: "Needs review",
  offering: "Offering",
  filled: "Filled",
  canceled: "Canceled",
  exhausted: "No acceptance",
  appointment_passed: "Time passed",
  canceled_after_acceptance: "Hold canceled",
  pending: "Awaiting response",
  sending: "Sending",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Timed out",
  delivery_failed: "Delivery failed",
  unavailable: "Unavailable",
  active: "On waitlist",
  removed: "Removed",
  delivered: "Delivered",
  failed: "Failed",
  queued: "Queued",
};
const badge = (status) =>
  `<span class="badge ${esc(status)}">${esc(names[status] || status)}</span>`;
const leaf = `<svg class="brand-mark" viewBox="0 0 40 48" fill="none" aria-hidden="true"><path d="M20 43V9M20 29C5 28 4 17 4 17S18 15 20 29ZM20 20C34 19 35 6 35 6S21 7 20 20ZM20 39C34 38 36 25 36 25S22 25 20 39Z" stroke="currentColor" stroke-width="1.6"/></svg>`;
const brand = `<a class="brand" href="/" data-nav>${leaf}<span>juniper<small>Salon & waitlist</small></span></a>`;
const icon = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${n === "openings" ? '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v5M16 3v5M4 11h16M8 15h3"/>' : n === "waitlist" ? '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0112 0v3M17 5a3 3 0 010 6M18 15a5 5 0 013 5"/>' : '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>'}</svg>`;
function toast(message, error = false) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.className = `show ${error ? "error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ""), 5000);
}
async function request(url, body) {
  const response = await fetch(url, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || "Request could not be confirmed.");
  return data;
}
async function command(body) {
  let requestId = crypto.randomUUID();
  // Preserve creation identity if the response is lost and staff retry the form.
  if (["createOpening", "addClient"].includes(body.type)) {
    const form = dialog.querySelector("form");
    if (form) {
      const signature = JSON.stringify({ ...body, id: undefined });
      if (form.dataset.signature !== signature) {
        form.dataset.signature = signature;
        form.dataset.requestId = crypto.randomUUID();
        form.dataset.entityId = crypto.randomUUID();
      }
      requestId = form.dataset.requestId;
      body.id = form.dataset.entityId;
    }
  }
  return request("/api/commands", { ...body, requestId });
}
function navigate(path) {
  history.pushState({}, "", path);
  lastSignature = "";
  render();
  refresh();
  window.scrollTo(0, 0);
}
function shell(content) {
  const section =
    location.pathname === "/waitlist"
      ? "waitlist"
      : location.pathname === "/demo"
        ? "demo"
        : "openings";
  return `<div class="shell"><aside class="sidebar">${brand}<nav class="nav" aria-label="Main navigation">${[
    ["openings", "/", "Openings"],
    ["waitlist", "/waitlist", "Waitlist"],
    ["demo", "/demo", "Demo inbox"],
  ]
    .map(
      ([key, url, label]) =>
        `<a href="${url}" data-nav class="${section === key ? "active" : ""}">${icon(key)}${label}</a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-foot"><div class="person"><span class="avatar">LC</span><span><strong>Lena & Carla</strong><br>Front desk</span></div>A little less back-and-forth.<br>A little more time for people.</div></aside><main class="main"><header class="topbar"><span>JUNIPER SALON <span style="margin:0 9px;color:#b0b9a8">/</span> Front desk</span><span class="live"><i class="dot"></i>${connectionError ? "Reconnecting…" : "Local prototype"} <span class="refresh-status">· Pacific time</span></span></header>${connectionError ? `<div class="error-box" role="alert">${esc(connectionError)} Showing the last known state.</div>` : ""}${content}<footer class="footer-line"><span>Made for the moments your day opens up.</span><span>Fictional clients · Simulated messaging · Square updated manually</span></footer></main></div>`;
}
function heading(eyebrow, title, sub, action = "") {
  return `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="sub">${sub}</p></div>${action}</div>`;
}
const createButton = `<button data-action="new-opening">＋ New opening</button>`;
function dashboard() {
  const all = salon.openings,
    active = all.filter((o) => o.phase === "offering"),
    filled = all.filter((o) => o.phase === "filled");
  const shown = all
    .filter(
      (o) =>
        filter === "all" ||
        (filter === "finished"
          ? !["review", "offering"].includes(o.phase)
          : o.phase === filter),
    )
    .slice()
    .reverse();
  return (
    heading(
      "A little room for possibility",
      "Your openings",
      "Keep the chair filled. Let the follow-up take care of itself.",
      createButton,
    ) +
    `<section class="hero"><div><h2>The next appointment could make someone’s day.</h2><p>Review your matches, send one offer at a time, and let the waitlist keep moving. You stay in control.</p></div><svg class="hero-symbol" viewBox="0 0 140 100" fill="none" aria-hidden="true"><path d="M70 100V8M70 45C28 47 20 16 20 16S63 8 70 45ZM70 66C112 63 123 25 123 25S80 22 70 66ZM70 89C38 88 28 59 28 59S60 55 70 89Z" stroke="#6e8660" stroke-width="1.5"/><circle cx="116" cy="11" r="7" stroke="#8c9a70"/></svg></section><div class="stats"><div class="stat"><span class="stat-number">${active.length}</span><span class="stat-label">Openings in progress</span></div><div class="stat"><span class="stat-number">${filled.length}</span><span class="stat-label">Openings filled</span></div><div class="stat"><span class="stat-number">${salon.clients.filter((c) => c.status === "active").length}</span><span class="stat-label">Clients on the waitlist</span></div></div><div class="section-line"><h2>The appointment board</h2><div class="tabs" aria-label="Filter openings">${[
      ["all", "All openings"],
      ["review", "To review"],
      ["offering", "In progress"],
      ["finished", "Finished"],
    ]
      .map(
        ([key, label]) =>
          `<button class="${filter === key ? "active" : ""}" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`,
      )
      .join(
        "",
      )}</div></div><section class="opening-grid">${shown.length ? shown.map(openingCard).join("") : `<div class="empty"><div class="empty-icon">✧</div><h2>${all.length ? "Nothing in this view" : "A fresh start for an open chair"}</h2><p>${all.length ? "Choose another filter to see your openings." : "An appointment canceled? Add the opening and we’ll find the people who are waiting for just this moment."}</p>${all.length ? "" : createButton}</div>`}</section><p class="note">Pilot goal: refill at least half of last-minute cancellations. These counts reflect this local demo only.</p>`
  );
}
function openingCard(o) {
  const offer = salon.offers.find((f) => f.id === o.currentOfferId);
  return `<a class="card opening-card" href="/openings/${o.id}" data-nav><div class="card-top"><span class="eyebrow" style="margin:0">${date(o.startsAt)}</span>${badge(o.phase)}</div><h3 class="title">${esc(o.service)} with ${esc(o.stylist)}</h3><div class="meta">${time(o.startsAt)} · ${o.minutes} min available${o.responseSeconds === 20 ? " · 20-sec demo" : ""}</div><div class="card-bottom"><span>${o.winnerId ? `✓ ${esc(client(o.winnerId).name)}` : offer && ["sending", "pending"].includes(offer.status) ? `Waiting on ${esc(client(offer.clientId).name.split(" ")[0])}` : o.phase === "review" ? "Review matches before sending" : "View outcome and history"}</span><span class="arrow">↗</span></div></a>`;
}
function detail(id) {
  const o = salon.openings.find((x) => x.id === id);
  if (!o)
    return heading(
      "Openings",
      "Opening not found",
      "Return to the appointment board.",
    );
  const offer = salon.offers.find((x) => x.id === o.currentOfferId),
    allOffers = salon.offers.filter((x) => x.openingId === id);
  const removed = excluded.get(id) || new Set();
  const match = salon.matches[id] || [];
  const available = match.filter((m) => m.eligible);
  let primary = "";
  if (o.phase === "review") {
    primary = `<section class="card"><div class="section-line"><h2>Review your matches</h2><span class="badge">${available.length} eligible</span></div><p class="sub">Earliest joined, first offered. Uncheck anyone unsuitable for this opening.</p>${available.length ? available.map((m, i) => `<label class="candidate"><input type="checkbox" data-candidate="${esc(m.client.id)}" data-opening="${id}" ${removed.has(m.client.id) ? "" : "checked"}><span class="avatar">${initials(m.client.name)}</span><span class="candidate-info"><strong>${esc(m.client.name)}</strong><p>${m.client.minutes} min · ${m.client.stylist === "any" ? "Any stylist" : esc(m.client.stylist) + " required"} · Joined ${date(m.client.joinedAt)}</p><p>Available ${date(m.client.availableFrom)}, ${time(m.client.availableFrom)} – ${date(m.client.availableUntil)}, ${time(m.client.availableUntil)}</p></span><span class="order">0${i + 1}</span></label>`).join("") : '<div class="notice">No clients match this opening. Check the excluded candidates below or cancel and create a corrected opening.</div>'}<details><summary>${match.filter((m) => !m.eligible).length} clients do not match</summary>${match
      .filter((m) => !m.eligible)
      .map(
        (m) =>
          `<div class="candidate excluded"><span class="candidate-info"><strong>${esc(m.client.name)}</strong><p>${esc(m.reasons.join(" · "))}</p></span></div>`,
      )
      .join(
        "",
      )}</details><label class="checkline"><input id="approve-consent" type="checkbox" data-consent="${id}" ${consent.has(id) ? "checked" : ""}><span>I’ve checked the appointment and candidates, and I want to contact clients now.</span></label><button class="wide" data-action="approve" data-id="${id}" ${available.length ? "" : "disabled"}>Approve & start outreach →</button></section>`;
  } else {
    const live = offer && ["sending", "pending"].includes(offer.status);
    primary = `<section class="card ${live ? "current-offer" : ""}"><p class="eyebrow">${live ? "The current offer" : "Opening outcome"}</p>${live ? `<h2>${esc(client(offer.clientId).name)}</h2><p class="sub">${offer.status === "sending" ? "Sending their offer…" : "Their turn to say yes. We’ll move on automatically if they decline or time out."}</p>${offer.expiresAt ? `<div class="timer" data-deadline="${offer.expiresAt}"></div><p class="meta">Deadline ${time(offer.expiresAt)} Pacific</p>` : ""}<a class="btn wide" href="/offers/${offer.token}" target="_blank">Open client offer ↗</a><p class="note">Simulated message · opens the client’s mobile page</p>` : `<h2>${o.phase === "filled" ? `A spot for ${esc(client(o.winnerId).name.split(" ")[0])}.` : o.phase === "exhausted" ? "No acceptance this time." : o.phase === "appointment_passed" ? "The appointment time has arrived." : "This opening is closed."}</h2><p class="sub">${o.phase === "filled" ? "The opening is held. No one else can claim it." : o.phase === "exhausted" ? "Every approved eligible client was tried. Staff can decide what to do next." : "No further clients will be contacted."}</p>`}${o.winnerId ? `<div class="notice ${o.squareUpdated ? "success" : ""}">${o.squareUpdated ? "✓ Staff marked Square changes as done." : o.phase === "filled" ? "Next: update Square and change or cancel the client’s original appointment." : "Update the cancellation in Square. The client is not automatically re-added to the waitlist."}</div>${o.squareUpdated ? "" : `<button class="secondary wide" data-action="square" data-id="${id}">I’ve updated Square manually</button>`}` : ""}</section><section class="card"><h2>Offer history</h2>${allOffers.length ? allOffers.map((f) => `<div class="candidate"><span class="avatar">${initials(client(f.clientId).name)}</span><span class="candidate-info"><strong>${esc(client(f.clientId).name)}</strong><p><a href="/offers/${f.token}" target="_blank">View client link ↗</a></p></span>${badge(f.status)}</div>`).join("") : '<p class="sub">No offers were sent.</p>'}<div class="divider"></div><h3>Still in the queue</h3><p class="sub">${
      o.phase === "offering"
        ? o.candidateIds
            .filter(
              (cid) =>
                client(cid)?.status === "active" &&
                !allOffers.some((f) => f.clientId === cid),
            )
            .map((cid) => esc(client(cid).name))
            .join(" · ") || "No remaining candidates"
        : "Outreach has ended."
    }</p></section>`;
  }
  return `<a class="back" href="/" data-nav>← All openings</a>${heading(date(o.startsAt), `${esc(o.service)} with ${esc(o.stylist)}`, `${time(o.startsAt)} Pacific · ${o.minutes} minutes available`, badge(o.phase))}<div class="detail-grid"><div>${primary}</div><aside><section class="card"><h3>Appointment details</h3><div class="appointment-facts"><div><span class="fact-label">Service</span><span class="fact-value">${esc(o.service)}</span></div><div><span class="fact-label">Stylist</span><span class="fact-value">${esc(o.stylist)}</span></div><div><span class="fact-label">Reply window</span><span class="fact-value">${o.responseSeconds === 20 ? "20 sec · demo" : "15 minutes"}</span></div></div><p class="sub">One offer at a time. Earliest eligible client first.</p>${["review", "offering", "filled"].includes(o.phase) ? `<div class="divider"></div><button class="danger wide" data-action="cancel" data-id="${id}" data-filled="${o.phase === "filled"}">${o.phase === "filled" ? "Cancel confirmed hold" : "Cancel opening"}</button>` : ""}</section><section class="card"><h2>The story so far</h2><ol class="timeline">${o.history
    .slice()
    .reverse()
    .map((h) => `<li><time>${time(h.at)}</time><p>${esc(h.text)}</p></li>`)
    .join("")}</ol></section></aside></div>`;
}
function waitlist() {
  return (
    heading(
      "Good things are worth waiting for",
      "The waitlist",
      "Client preferences, availability, and a fair place in line.",
      `<button data-action="new-client">＋ Add client</button>`,
    ) +
    `<section class="card table-wrap"><table class="table"><thead><tr><th>Client</th><th>Looking for</th><th>Availability · Pacific</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${salon.clients.map((c) => `<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.mobile)} · Joined ${date(c.joinedAt)}</small></td><td>${esc(c.service)} · ${c.minutes} min<small>${c.stylist === "any" ? "Any stylist" : esc(c.stylist) + " required"}</small></td><td>${date(c.availableFrom)}, ${time(c.availableFrom)}<small>to ${date(c.availableUntil)}, ${time(c.availableUntil)}</small></td><td>${badge(c.status)}</td><td>${c.status === "active" ? `<button class="ghost small" data-action="remove" data-id="${c.id}">Remove</button>` : ""}</td></tr>`).join("")}</tbody></table></section><p class="note">Declining an offer keeps a client on the list. Accepting an opening removes them from consideration for other openings.</p>`
  );
}
function inbox() {
  return (
    heading(
      "A peek at the conversation",
      "Demo inbox",
      "Messages are simulated. No real texts leave this prototype.",
    ) +
    `<div class="detail-grid"><section class="card"><h2>Sent by Juniper</h2>${
      salon.messages.length
        ? salon.messages
            .slice()
            .reverse()
            .map((m) => {
              const o = salon.openings.find((o) => o.id === m.openingId),
                f = salon.offers.find((f) => f.id === m.offerId);
              return `<article class="message"><div class="message-head"><span>${m.kind === "offer" ? esc(client(m.clientId).name) : "Client + front desk"} · ${time(m.at)}</span>${badge(m.status)}</div><p>${esc(m.text)}</p><p class="meta">${date(o.startsAt)} · ${time(o.startsAt)} Pacific</p>${f ? `<a class="btn small secondary" href="/offers/${f.token}" target="_blank">Open client page ↗</a>` : ""}</article>`;
            })
            .join("")
        : '<div class="empty"><h2>Quiet for now.</h2><p>Approve an opening to send the first simulated offer.</p></div>'
    }</section><aside><section class="card"><p class="eyebrow">Demo controls</p><h2>Try a delivery failure</h2><p class="sub">Enable failure before starting outreach. The failed offer will be recorded and the queue will advance.</p>${salon.clients
      .filter((c) => c.status === "active")
      .map(
        (c) =>
          `<label class="candidate"><input type="checkbox" data-failure="${c.id}" ${c.failDelivery ? "checked" : ""}><span class="candidate-info"><strong>${esc(c.name)}</strong><p>${c.failDelivery ? "Delivery will fail" : "Normal simulated delivery"}</p></span></label>`,
      )
      .join(
        "",
      )}</section><section class="card"><h3>Make time move faster</h3><p class="sub">Choose the 20-second demo window when creating an opening. Timeout progression runs in Temporal, even with this page closed.</p><div class="divider"></div><a class="btn secondary wide" href="http://localhost:8233/namespaces/default/workflows/${encodeURIComponent(salon.workflowId)}" target="_blank">Inspect Temporal history ↗</a><p class="note">The salon coordinator stays running to manage future openings.</p></section></aside></div>`
  );
}
function offerPage() {
  if (!clientView)
    return `<main class="client-page">${brand}<div class="client-card"><h2>${connectionError ? "Unable to load this offer" : "Loading your offer…"}</h2><p>${esc(connectionError)}</p></div></main>`;
  const { offer: f, opening: o, client: c } = clientView;
  const confirmed = f.status === "accepted" && o.phase === "filled";
  const pending =
    f.status === "pending" && o.phase === "offering" && now() < f.expiresAt;
  const title = confirmed
    ? "You’re on the books."
    : pending
      ? "A little sooner, just for you."
      : f.status === "declined"
        ? "Maybe next time."
        : f.status === "sending"
          ? "Your offer is on its way."
          : "This offer has closed.";
  return `<main class="client-page">${brand}<section class="client-card"><div class="client-icon">${confirmed ? "✓" : pending ? "✧" : "—"}</div><p class="eyebrow">${confirmed ? "Appointment held" : pending ? "An earlier appointment" : "Your appointment offer"}</p><h1>${title}</h1><p class="sub">${confirmed ? `We’re looking forward to seeing you, ${esc(c.name.split(" ")[0])}. The front desk will update your booking.` : pending ? `Hi ${esc(c.name.split(" ")[0])}, a spot just opened up at Juniper. It’s yours to accept before the offer expires.` : f.status === "declined" && c.status === "active" ? "You’re still on the waitlist. We’ll keep you in mind for another opening." : "No new appointment can be claimed from this link. Contact the salon if you have a question."}</p><div class="appointment-facts"><div><span class="fact-label">Your service</span><span class="fact-value">${esc(o.service)} · ${c.minutes} min</span></div><div><span class="fact-label">Your stylist</span><span class="fact-value">${esc(o.stylist)}</span></div><div><span class="fact-label">Date</span><span class="fact-value">${date(o.startsAt)}</span></div><div><span class="fact-label">Time</span><span class="fact-value">${time(o.startsAt)} Pacific</span></div></div>${pending ? `<div class="timer" data-deadline="${f.expiresAt}"></div><div class="stack"><button data-action="respond" data-choice="accept" class="wide">Yes, I’ll take it</button><button data-action="respond" data-choice="decline" class="secondary wide">No thanks, keep me on the waitlist</button></div>` : `<div class="notice ${confirmed ? "success" : ""}">${confirmed ? "✓ Confirmed for you" : esc(names[o.phase === "canceled_after_acceptance" ? o.phase : f.status])}</div>`}${o.responseSeconds === 20 ? '<p class="note">Demo mode: a 20-second response window replaces the normal 15 minutes.</p>' : ""}${connectionError ? `<div class="error-box">${esc(connectionError)}</div>` : ""}</section><p class="note">Local assessment prototype · fictional client<br>Messages are simulated. Square updates are handled by staff.</p></main>`;
}
function render() {
  document.title = location.pathname.startsWith("/offers/")
    ? "Your offer · Juniper"
    : "Juniper · Front desk";
  if (location.pathname.startsWith("/offers/")) app.innerHTML = offerPage();
  else if (salon)
    app.innerHTML = shell(
      location.pathname === "/waitlist"
        ? waitlist()
        : location.pathname === "/demo"
          ? inbox()
          : location.pathname.startsWith("/openings/")
            ? detail(location.pathname.split("/")[2])
            : dashboard(),
    );
  else
    app.innerHTML = `<main class="loading"><h1>Welcome to Juniper.</h1><p>${esc(connectionError || "Connecting to the salon…")}</p></main>`;
  tick();
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const isOffer = location.pathname.startsWith("/offers/");
    const data = await request(
      isOffer ? `/api/offers/${location.pathname.split("/")[2]}` : "/api/salon",
    );
    offset = data.serverNow - Date.now();
    delete data.serverNow;
    const signature = JSON.stringify(data);
    const changed = signature !== lastSignature || connectionError;
    connectionError = "";
    document.body.classList.remove("offline");
    if (isOffer) clientView = data;
    else salon = data;
    if (changed) {
      lastSignature = signature;
      render();
    }
  } catch (error) {
    const message =
      error.name === "TimeoutError"
        ? "The service is taking longer than expected. No new action is confirmed."
        : error.message;
    if (connectionError !== message) {
      connectionError = message;
      document.body.classList.add("offline");
      render();
    }
  } finally {
    refreshing = false;
  }
}
function tick() {
  document.querySelectorAll("[data-deadline]").forEach((el) => {
    const seconds = Math.max(
      0,
      Math.ceil((Number(el.dataset.deadline) - now()) / 1000),
    );
    el.innerHTML = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}<span class="timer-label">${seconds ? "remaining" : "Checking outcome…"}</span>`;
    if (!seconds && location.pathname.startsWith("/offers/"))
      document
        .querySelectorAll('[data-action="respond"]')
        .forEach((b) => (b.disabled = true));
  });
}
function localInput(timestamp) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
  return parts.replace(" ", "T");
}
function parseSalonTime(value) {
  const target = Date.parse(value + "Z");
  let result = target;
  for (let i = 0; i < 3; i++) {
    const rendered = Date.parse(localInput(result) + "Z");
    result += target - rendered;
  }
  if (localInput(result) !== value)
    throw new Error("That local time does not exist. Choose another time.");
  return result;
}
function openForm(kind) {
  const opening = kind === "opening",
    future = Math.ceil((now() + 3600000) / 900000) * 900000;
  dialog.innerHTML = `<div class="dialog-head"><div><p class="eyebrow">${opening ? "Make room for someone" : "Welcome to the list"}</p><h2>${opening ? "New opening" : "Add a client"}</h2></div><button class="ghost close" data-action="close" aria-label="Close dialog">×</button></div><form id="${opening ? "opening-form" : "client-form"}"><div class="form-grid">${opening ? "" : `<label class="full">Client name<input name="name" required maxlength="80" placeholder="e.g. Avery Lane"></label><label class="full">Mobile number · fictional data only<input name="mobile" required value="202-555-0199"></label>`}<label>Service<select name="service">${salon.services.map((s) => `<option>${s.name}</option>`).join("")}</select></label><label>${opening ? "Stylist" : "Stylist requirement"}<select name="stylist">${opening ? "" : '<option value="any">Any stylist</option>'}${salon.stylists.map((s) => `<option>${s}</option>`).join("")}</select></label>${opening ? `<label class="full">Appointment start · Pacific time<input name="startsAt" type="datetime-local" required value="${localInput(future)}"></label><label>Available minutes<input name="minutes" type="number" min="15" max="240" required value="60"></label><label>Response window<select name="responseSeconds"><option value="900">15 minutes · normal</option><option value="20">20 seconds · demo</option></select></label>` : `<label class="full">Available from · Pacific time<input name="availableFrom" type="datetime-local" required value="${localInput(now())}"></label><label class="full">Available until · Pacific time<input name="availableUntil" type="datetime-local" required value="${localInput(now() + 7 * 86400000)}"></label>`}</div><p class="note">${opening ? "You’ll review eligible clients before any offer is sent." : "Duration follows the selected service. Joining now places this client after earlier eligible entries."}</p><div id="form-error" role="alert"></div><div class="form-foot"><button type="button" class="secondary" data-action="close">Cancel</button><button type="submit">${opening ? "Find matches →" : "Add to waitlist"}</button></div></form>`;
  dialog.showModal();
}
document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    navigate(nav.getAttribute("href"));
    return;
  }
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    filter = filterButton.dataset.filter;
    render();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "close") {
    dialog.close();
    return;
  }
  if (action === "new-opening") {
    openForm("opening");
    return;
  }
  if (action === "new-client") {
    openForm("client");
    return;
  }
  if (busy) return;
  if (
    action === "cancel" &&
    !confirm(
      button.dataset.filled === "true"
        ? "Cancel this confirmed hold? Update Square manually afterward. The client will not automatically rejoin the waitlist."
        : "Cancel this opening? Pending offers will become unavailable and outreach will stop.",
    )
  )
    return;
  if (
    action === "remove" &&
    !confirm(
      "Remove this client from the waitlist and close their pending offers?",
    )
  )
    return;
  busy = true;
  button.disabled = true;
  try {
    let result;
    if (action === "approve")
      result = await command({
        type: "approve",
        openingId: id,
        contactNow: consent.has(id),
        reviewedCandidateIds: reviewedSnapshots.get(id) || [],
        excludedIds: [...(excluded.get(id) || [])],
      });
    if (action === "cancel")
      result = await command({
        type: "cancel",
        openingId: id,
        afterAcceptance: button.dataset.filled === "true",
      });
    if (action === "square")
      result = await command({ type: "squareUpdated", openingId: id });
    if (action === "remove")
      result = await command({ type: "removeClient", clientId: id });
    if (action === "respond")
      result = await request(
        `/api/offers/${location.pathname.split("/")[2]}/respond`,
        { choice: button.dataset.choice, requestId: crypto.randomUUID() },
      );
    if (result) toast(result.message);
    await refresh();
  } catch (error) {
    toast(error.message, true);
    await refresh();
  } finally {
    busy = false;
    button.disabled = false;
    tick();
  }
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  if (el.dataset.candidate) {
    const set = excluded.get(el.dataset.opening) || new Set();
    if (el.checked) set.delete(el.dataset.candidate);
    else set.add(el.dataset.candidate);
    excluded.set(el.dataset.opening, set);
  }
  if (el.dataset.consent) {
    if (el.checked) {
      consent.add(el.dataset.consent);
      reviewedSnapshots.set(el.dataset.consent, (salon.matches[el.dataset.consent] || []).filter(m => m.eligible).map(m => m.client.id));
    }
    else consent.delete(el.dataset.consent);
  }
  if (el.dataset.failure) {
    el.disabled = true;
    try {
      await command({
        type: "deliverySetting",
        clientId: el.dataset.failure,
        fail: el.checked,
      });
      await refresh();
    } catch (error) {
      el.checked = !el.checked;
      toast(error.message, true);
    } finally {
      el.disabled = false;
    }
  }
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!["opening-form", "client-form"].includes(form.id) || busy) return;
  busy = true;
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    let result;
    if (form.id === "opening-form")
      result = await command({
        ...values,
        type: "createOpening",
        id: crypto.randomUUID(),
        startsAt: parseSalonTime(values.startsAt),
        minutes: Number(values.minutes),
        responseSeconds: Number(values.responseSeconds),
      });
    else
      result = await command({
        ...values,
        type: "addClient",
        id: crypto.randomUUID(),
        availableFrom: parseSalonTime(values.availableFrom),
        availableUntil: parseSalonTime(values.availableUntil),
      });
    dialog.close();
    toast(result.message);
    await refresh();
    if (form.id === "opening-form") navigate(`/openings/${result.id}`);
  } catch (error) {
    document.querySelector("#form-error").innerHTML =
      `<div class="error-box">${esc(error.message)}</div>`;
  } finally {
    busy = false;
    button.disabled = false;
  }
});
window.addEventListener("popstate", () => {
  lastSignature = "";
  clientView = undefined;
  render();
  refresh();
});
refresh();
setInterval(refresh, 1500);
setInterval(tick, 250);
