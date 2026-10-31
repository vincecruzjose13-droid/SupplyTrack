// app.js - the student page. Products, hours and receipts come LIVE from Firebase (through data.js).
let products = [], cart = {}, used = {}, shown = 12;   // used = reservations per hour on the chosen date
let stopSlots = null, stopReceipt = null;              // call these to stop a live listener

const $ = id => document.getElementById(id);
const picture = p => `<span class="thumb tile tile${p.name.length % 5}">${esc(p.name.charAt(0).toUpperCase())}</span>`;
const limitFor = id => (products.find(p => p.id === id) || {}).max_qty || 10;

/* ---------- Catalog ---------- */
function fillCategories() {
  const keep = $("category").value || "All", cats = [...new Set(products.map(p => p.category))].sort();
  $("category").innerHTML = '<option value="All">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join("");
  $("category").value = cats.includes(keep) ? keep : "All";
}
function renderProducts() {
  const q = $("search").value.trim().toLowerCase(), cat = $("category").value, by = $("sort").value;
  const list = products.filter(p => (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) && (cat === "All" || p.category === cat));
  if (by === "low") list.sort((a, b) => a.price - b.price);
  else if (by === "high") list.sort((a, b) => b.price - a.price);
  else list.sort((a, b) => a.name.localeCompare(b.name));
  const visible = list.slice(0, shown);
  $("item-count").textContent = visible.length + " of " + list.length + " items shown";
  $("more-btn").classList.toggle("hidden", visible.length >= list.length);
  $("products").innerHTML = visible.map(p => `<article class="product">
    <div class="product-img">${picture(p)}</div>
    <div class="product-top"><span class="status ${p.availability.toLowerCase()}">${p.availability}</span></div>
    <h3>${esc(p.name)}</h3><span class="category-label">${esc(p.category)}</span>
    <div class="product-bottom"><span class="price">${money(p.price)}</span>
    <button class="small-button" data-add="${p.id}" ${p.availability === "Unavailable" ? "disabled" : ""}>Add to cart</button></div></article>`).join("") || "<p>No supplies to show.</p>";
}
["search", "category", "sort"].forEach(id => $(id).addEventListener("input", () => { shown = 12; renderProducts(); }));
$("more-btn").addEventListener("click", () => { shown += 12; renderProducts(); });

/* ---------- Cart (kept on this device only) ---------- */
try { cart = JSON.parse(localStorage.getItem("supplytrack-cart")) || {}; } catch (e) { cart = {}; }
function cleanCart() {   // drop items that were removed or became unavailable, and cap the quantities
  for (const id in cart) {
    const p = products.find(x => x.id === id);
    if (!p || p.availability === "Unavailable") delete cart[id]; else cart[id] = Math.min(cart[id], p.max_qty);
  }
}
function renderCart() {
  const rows = Object.keys(cart).map(id => ({ p: products.find(x => x.id === id), qty: cart[id] })).filter(r => r.p);
  const n = rows.reduce((s, r) => s + r.qty, 0);
  $("cart-count").textContent = n + (n === 1 ? " item" : " items");
  $("cart-items").innerHTML = rows.length ? rows.map(r => `<div class="cart-row">${picture(r.p)}
    <div class="grow"><strong>${esc(r.p.name)}</strong><small>${money(r.p.price)} each = ${money(r.p.price * r.qty)}</small></div>
    <div class="qty"><button type="button" data-qty="${r.p.id}" data-d="-1">-</button><strong>${r.qty}</strong><button type="button" data-qty="${r.p.id}" data-d="1">+</button></div></div>`).join("")
    : '<p class="mutedreservation">Your cart is empty. Add supplies from the catalog.</p>';
  $("cart-total").textContent = rows.length ? "Estimated total: " + money(rows.reduce((s, r) => s + r.p.price * r.qty, 0)) : "";
  try { localStorage.setItem("supplytrack-cart", JSON.stringify(cart)); } catch (e) {}
}
$("products").addEventListener("click", e => {   // "Add to cart"
  const id = e.target.dataset.add; if (!id) return;
  cart[id] = Math.min((cart[id] || 0) + 1, limitFor(id)); renderCart();
});
$("cart-items").addEventListener("click", e => {   // the + and - buttons
  const id = e.target.dataset.qty; if (!id) return;
  cart[id] = Math.min(Math.max((cart[id] || 0) + Number(e.target.dataset.d), 0), limitFor(id));
  if (!cart[id]) delete cart[id]; renderCart();
});

/* ---------- Pickup date and hour ---------- */
function fillTimes() {   // every hour is listed. Full or passed hours are greyed out.
  const date = $("pickup-date").value, keep = $("pickup-time").value;
  if (!date) { $("pickup-time").innerHTML = '<option value="">Pick a date first</option>'; return; }
  $("pickup-time").innerHTML = '<option value="">Choose a time</option>' + SLOT_HOURS.map(h => {
    const left = SLOT_LIMIT - (used[h] || 0), passed = date === todayText() && h <= new Date().getHours();
    const note = passed ? "(passed)" : left <= 0 ? "(FULL)" : "(" + left + " left)";
    return `<option value="${h}" ${left <= 0 || passed ? "disabled" : ""}>${hourLabel(h)} ${note}</option>`;
  }).join("");
  if ([...$("pickup-time").options].some(o => o.value === keep && !o.disabled)) $("pickup-time").value = keep;   // keep the choice if still free
}
$("pickup-date").addEventListener("change", () => {   // watch the chosen date live: when anyone books, the hours update
  if (stopSlots) stopSlots();
  used = {}; fillTimes();
  stopSlots = $("pickup-date").value ? watchSlots($("pickup-date").value, u => { used = u; fillTimes(); }) : null;
});

/* ---------- Reservation form ---------- */
function showMsg(text, isError) { const m = $("reservation-result"); m.className = "result" + (isError ? " error" : ""); m.textContent = text; }
function validate(v) {
  const err = {};
  if (v("student-name").length < 2) err["student-name"] = "Enter your full name.";
  if (v("student-id").length < 1) err["student-id"] = "Enter your student ID.";
  if (!/^\S+@\S+\.\S+$/.test(v("student-email"))) err["student-email"] = "Enter a valid email address.";
  if (!$("pickup-date").value) err["pickup-date"] = "Pick a pickup date.";
  else if ($("pickup-date").value < todayText()) err["pickup-date"] = "Pick today or a later date.";
  if (!$("pickup-time").value) err["pickup-time"] = "Pick a pickup time.";
  if (!Object.keys(cart).length) err["cart"] = "Add at least one item first.";
  return err;
}
$("reservation-form").addEventListener("submit", async e => {
  e.preventDefault();
  const v = id => $(id).value.trim(), err = validate(v);
  ["student-name", "student-id", "student-email", "pickup-date", "pickup-time", "cart"].forEach(k => $("err-" + k).textContent = err[k] || "");
  if (Object.keys(err).length) { showMsg("Please fix the messages in red.", true); return; }
  const date = v("pickup-date"), hour = Number(v("pickup-time"));
  const label = new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + hourLabel(hour);
  const items = Object.keys(cart).map(id => { const p = products.find(x => x.id === id); return { name: p.name, price: p.price, qty: cart[id] }; });
  $("submit-btn").disabled = true; showMsg("Sending your request...", false);
  try {
    const code = await reserve({ name: v("student-name"), student_id: v("student-id"), email: v("student-email"), pickup: label, pickup_date: date, pickup_hour: hour, items: items });
    cart = {}; renderCart(); $("reservation-form").reset();
    if (stopSlots) stopSlots(); stopSlots = null; used = {}; fillTimes();
    showMsg("Request sent! Your code is " + code + ". Write it down. It is NOT confirmed until the admin checks the shelf.", false);
    $("track-code").value = code; lookup(code, true);
  } catch (error) { showMsg(error.message, true); }
  $("submit-btn").disabled = false;
});

/* ---------- Receipt (updates live when the admin changes the status) ---------- */
const TITLES = { Pending: "Reservation REQUEST - not confirmed yet", Confirmed: "Reservation confirmed by the admin", Preparing: "Confirmed - being prepared", "Ready for pickup": "Ready for pickup", Completed: "Purchase completed", Rejected: "Request rejected", Expired: "Reservation expired", Cancelled: "Request cancelled" };
const STEPS = ["Pending", "Confirmed", "Preparing", "Ready for pickup", "Completed"];
function progressHtml(status) {   // boxes up to the current step turn green
  if (!STEPS.includes(status)) return "";
  const at = STEPS.indexOf(status);
  return '<ol class="progress">' + STEPS.map((s, i) => `<li class="${i <= at ? "done" : ""}">${s}</li>`).join("") + "</ol>";
}
function showReceipt(r, scroll) {
  const total = r.items.reduce((s, i) => s + i.qty * i.price, 0);
  const history = r.history.map(h => `<li>${esc(new Date(h.at).toLocaleString())} - ${esc(h.status)}</li>`).join("");
  $("receipt-view").innerHTML = `<div class="receipt"><p class="receipt-title">${esc(TITLES[r.status] || r.status)}</p><h3>${esc(r.code)}</h3>
    ${progressHtml(r.status)}<p>Requested: ${esc(new Date(r.created_at).toLocaleString())}<br>Name: ${esc(r.name)}<br>Pickup: ${esc(r.pickup)}<br>Status: <b>${esc(r.status)}</b></p>
    ${r.reason ? `<p><b>Reason:</b> ${esc(r.reason)}</p>` : ""}
    <table><tr><th>Qty</th><th>Item</th><th>Each</th><th>Subtotal</th></tr>${r.items.map(i => `<tr><td>${i.qty}</td><td>${esc(i.name)}</td><td>${money(i.price)}</td><td>${money(i.price * i.qty)}</td></tr>`).join("")}</table>
    <p><b>Estimated total: ${money(total)}</b></p><p class="tiny">Prices and stock are checked by the admin. Payment is made at the shop.</p>
    <p class="tiny">This receipt updates by itself when the admin changes the status.</p><p class="tiny"><b>History</b></p><ul class="history">${history}</ul>
    <button class="btn noprint" onclick="window.print()">Print / Save as PDF</button></div>`;
  if (scroll) $("trackcontain").scrollIntoView({ behavior: "smooth" });
}
function lookup(code, scroll) {   // find the reservation by its code only, then keep watching it
  code = code.trim().toUpperCase(); if (!code) return;
  if (stopReceipt) stopReceipt();
  stopReceipt = watchReservation(code, r => {
    if (!r) { $("receipt-view").innerHTML = '<p class="err-box">No reservation matches that code.</p>'; return; }
    showReceipt(r, scroll); scroll = false;   // scroll only the first time
  }, error => { $("receipt-view").innerHTML = `<p class="err-box">${esc(error.message)}</p>`; });
}
$("track-form").addEventListener("submit", e => { e.preventDefault(); lookup($("track-code").value, true); });

/* ---------- Start ---------- */
const last = new Date(); last.setDate(last.getDate() + 30);   // the calendar allows today up to 30 days ahead
$("pickup-date").min = todayText(); $("pickup-date").max = dateText(last);
fillTimes();
$("products").innerHTML = '<p class="loading">Loading supplies...</p>';
watchProducts(list => { products = list; cleanCart(); fillCategories(); renderProducts(); renderCart(); },
  error => { $("products").innerHTML = `<p class="err-box">Could not load the catalog: ${esc(error.message)} (check firebase-config.js and the Firestore rules)</p>`; });
