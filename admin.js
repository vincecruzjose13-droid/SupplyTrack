// admin.js - the admin page. Sign in, then reservations and products update LIVE from Firebase.
const auth = firebase.auth();
const NEXT = { "Pending": ["Confirmed", "Rejected"], "Confirmed": ["Preparing", "Rejected"], "Preparing": ["Ready for pickup"], "Ready for pickup": ["Completed", "Expired"] };
const STATUSES = ["Pending", "Confirmed", "Preparing", "Ready for pickup", "Completed", "Rejected", "Expired", "Cancelled"];
let reservations = [], products = [], stops = [];
const $ = id => document.getElementById(id);
const fail = error => alert(error.message);
const pill = s => ({ Pending: "limited", Rejected: "unavailable", Expired: "unavailable", Cancelled: "unavailable" }[s] || "available");

/* ---------- Sign in / out ---------- */
$("gate").addEventListener("submit", e => {
  e.preventDefault(); $("login-err").textContent = "";
  auth.signInWithEmailAndPassword($("login-email").value.trim(), $("login-password").value).catch(() => { $("login-err").textContent = "Wrong email or password."; });
});
$("lock-btn").addEventListener("click", () => auth.signOut());
auth.onAuthStateChanged(user => {   // runs when the page opens and whenever the admin signs in or out
  stops.forEach(stop => stop()); stops = [];
  $("gate").classList.toggle("hidden", !!user); $("main").classList.toggle("hidden", !user);
  if (user) stops = [watchAllReservations(list => { reservations = list; render(); }, fail), watchProducts(list => { products = list; renderProducts(); }, fail)];
});

/* ---------- Reservations ---------- */
function card(r) {
  const total = r.items.reduce((s, i) => s + i.qty * i.price, 0);
  const lines = r.items.map(i => `${i.qty} x ${esc(i.name)} (${money(i.qty * i.price)})`).join("<br>");
  const btns = (NEXT[r.status] || []).map(s => `<button class="btn ${s === "Rejected" ? "danger" : ""}" data-code="${esc(r.code)}" data-to="${s}">${s === "Rejected" ? "Reject" : "Mark " + s}</button>`).join("");
  return `<article class="reservation-card"><div class="reservation-head"><div><h3>${esc(r.code)}</h3>
    <p>${esc(r.name)} (${esc(r.student_id)}) · ${esc(r.email)} · Pickup: ${esc(r.pickup)}<br>${esc(new Date(r.created_at).toLocaleString())}</p></div><span class="status ${pill(r.status)}">${esc(r.status)}</span></div>
    <p class="items">${lines}<br><strong>Estimated total: ${money(total)}</strong></p>
    ${r.status === "Pending" ? '<p class="tiny">Check the real shelf before confirming.</p>' : ""}
    ${r.reason ? `<p class="tiny">Reason: ${esc(r.reason)}</p>` : ""}<div class="reservation-actions">${btns}</div></article>`;
}
function render() {
  const n = s => reservations.filter(r => r.status === s).length;
  $("pending-count").textContent = n("Pending"); $("active-count").textContent = n("Confirmed") + n("Preparing"); $("ready-count").textContent = n("Ready for pickup");
  $("sync-note").textContent = "Live from Firebase. Last update: " + new Date().toLocaleTimeString();
  const f = $("filter").value, q = $("req-search").value.trim().toLowerCase();
  const shown = reservations.filter(r => (f === "All" || r.status === f) && [r.code, r.name, r.student_id].some(t => t.toLowerCase().includes(q)));
  $("reservations-list").innerHTML = shown.map(card).join("") || "<p>No reservations.</p>";
}
$("filter").innerHTML = "<option>All</option>" + STATUSES.map(s => `<option>${s}</option>`).join("");
$("filter").addEventListener("change", render);
$("req-search").addEventListener("input", render);
$("reservations-list").addEventListener("click", async e => {   // the status buttons
  const code = e.target.dataset.code, to = e.target.dataset.to; if (!code) return;
  let reason = "";
  if (to === "Rejected") { reason = (prompt("Why is this being rejected? (the student sees this)") || "").trim(); if (!reason) return; }
  try { await setStatus(reservations.find(r => r.code === code), to, reason); } catch (error) { fail(error); }
});

/* ---------- Products: add, change availability, remove ---------- */
function renderProducts() {
  $("sample-btn").classList.toggle("hidden", products.length > 0);
  $("cats").innerHTML = [...new Set(products.map(p => p.category))].sort().map(c => `<option value="${esc(c)}">`).join("");
  $("product-list").innerHTML = products.map(p => `<div class="admin-row"><strong class="grow">${esc(p.name)}</strong><span>${esc(p.category)}</span><span>${money(p.price)}</span>
    <select class="catalogdropdown" data-id="${p.id}" aria-label="Availability">${["Available", "Limited", "Unavailable"].map(a => `<option ${p.availability === a ? "selected" : ""}>${a}</option>`).join("")}</select>
    <button class="btn danger" data-del="${p.id}" type="button">Remove</button></div>`).join("") || "<p>No products yet.</p>";
}
$("add-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("new-name").value.trim(), category = $("new-category").value.trim(), price = Number($("new-price").value), max = Number($("new-max").value);
  let msg = "";
  if (!name || !category) msg = "Fill in the name and category.";
  else if (!(price > 0)) msg = "Price must be above 0.";
  else if (!Number.isInteger(max) || max < 1 || max > 50) msg = "Max per student must be 1 to 50.";
  else if (products.some(p => p.name.toLowerCase() === name.toLowerCase())) msg = "That product already exists.";
  $("add-err").textContent = msg; if (msg) return;
  try { await addProduct({ name: name, category: category, price: price, max_qty: max, availability: $("new-avail").value }); $("add-form").reset(); } catch (error) { fail(error); }
});
$("product-list").addEventListener("change", e => { if (e.target.dataset.id) setAvailability(e.target.dataset.id, e.target.value).catch(fail); });
$("product-list").addEventListener("click", e => { if (e.target.dataset.del && confirm("Remove this product?")) removeProduct(e.target.dataset.del).catch(fail); });
$("sample-btn").addEventListener("click", () => loadSamples().catch(fail));
