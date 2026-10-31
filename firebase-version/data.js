// data.js - ALL talking to Firebase happens in this one file. Both pages use it.
// Firebase is our "server": it keeps the data, and every device sees the same data live.
const CODE_PREFIX = "GC-BC-";                           // codes look like GC-BC-01, GC-BC-02, ...
const SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];   // pickup hours: 8 AM to 4 PM
const SLOT_LIMIT = 10;                                   // max reservations per hour (use the same number in the Firestore rules)
const FREES = ["Rejected", "Cancelled", "Expired"];      // these statuses give the hour back

const money = n => "₱" + Number(n).toFixed(2);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hourLabel = h => (h % 12 || 12) + ":00 " + (h < 12 ? "AM" : "PM");
const dateText = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");   // 2026-10-30
const todayText = () => dateText(new Date());

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
const FV = firebase.firestore.FieldValue;

/* ---------- Watching data LIVE. Each function returns a "stop" function. ---------- */
const watchProducts = (show, fail) => db.collection("products").onSnapshot(s => show(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail);
const watchReservation = (code, show, fail) => db.doc("reservations/" + code).onSnapshot(d => show(d.exists ? d.data() : null), fail);
const watchAllReservations = (show, fail) => db.collection("reservations").orderBy("created_at", "desc").onSnapshot(s => show(s.docs.map(d => d.data())), fail);
const watchSlots = (date, show) => db.collection("slots").where("date", "==", date).onSnapshot(s => {   // {hour: how many are booked}
  const used = {}; s.forEach(d => { used[d.data().hour] = d.data().count; }); show(used);
});

/* ---------- Student: send a reservation ---------- */
function reserve(info) {   // one all-or-nothing step: next code number + a spot in the hour + save the reservation
  const counter = db.doc("meta/counter"), slot = db.doc("slots/" + info.pickup_date + "_" + info.pickup_hour);
  return db.runTransaction(async tx => {
    const c = await tx.get(counter), s = await tx.get(slot);
    const n = (c.exists ? c.data().n : 0) + 1, taken = s.exists ? s.data().count : 0, now = Date.now();
    if (taken >= SLOT_LIMIT) throw new Error("Sorry, that hour just became full. Please pick another time.");
    const code = CODE_PREFIX + String(n).padStart(2, "0");
    tx.set(counter, { n: n });
    tx.set(slot, { date: info.pickup_date, hour: info.pickup_hour, count: taken + 1 });
    tx.set(db.doc("reservations/" + code), { ...info, code: code, status: "Pending", reason: "", created_at: now, history: [{ status: "Pending", at: now }] });
    return code;
  });
}

/* ---------- Admin: change a status, manage products ---------- */
function setStatus(r, to, reason) {
  const batch = db.batch();
  batch.update(db.doc("reservations/" + r.code), { status: to, reason: reason || r.reason, history: FV.arrayUnion({ status: to, at: Date.now() }) });
  if (FREES.includes(to)) batch.update(db.doc("slots/" + r.pickup_date + "_" + r.pickup_hour), { count: FV.increment(-1) });   // give the hour back
  return batch.commit();
}
const addProduct = p => db.collection("products").add(p);
const setAvailability = (id, value) => db.doc("products/" + id).update({ availability: value });
const removeProduct = id => db.doc("products/" + id).delete();
function loadSamples() { const b = db.batch(); PRODUCTS.forEach(p => b.set(db.collection("products").doc(), p)); return b.commit(); }
