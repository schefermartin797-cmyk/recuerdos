import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

let auth, db;
try {
  if (String(firebaseConfig.apiKey).includes("PEGAR_AQUI")) throw new Error("Falta la configuración de Firebase");
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (err) {
  console.error(err);
  $("loginError").textContent = "Error de configuración: " + err.message;
}
window.addEventListener("error", (e) => { $("loginError").textContent = "Error: " + e.message; });

/* ---------- Estado ---------- */
let unsubscribe = null;
let photos = [];            // [{id, data, caption, day, createdAt}]
let byDay = new Map();      // "YYYY-MM-DD" -> [photos]
let pendingFiles = [];
let uploadDay = null;
let openDay = null;
let cursor = new Date(); cursor.setDate(1);

/* ---------- Fechas (siempre en hora local) ---------- */
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => keyOf(new Date());
const longDate = (k) => { const d = fromKey(k); return d.getDate() + " de " + MESES[d.getMonth()]; };
const weekday = (k) => DIAS[fromKey(k).getDay()];
function rotFor(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return (h % 7) - 3;
}

/* ---------- Login ---------- */
if (auth) onAuthStateChanged(auth, (user) => {
  $("login").hidden = !!user;
  $("app").hidden = !user;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (user) listenPhotos();
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginError").textContent = "";
  if (!auth) { $("loginError").textContent = "Firebase no está configurado (revisá firebase-config.js)."; return; }
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (err) {
    console.error(err);
    $("loginError").textContent = "No pudimos entrar (" + (err.code || "error") + "). Revisá el email y la contraseña.";
  }
});
$("logout").addEventListener("click", () => auth && signOut(auth));

/* ---------- Datos ---------- */
function listenPhotos() {
  const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(q, (snap) => {
    photos = [];
    snap.forEach((d) => {
      const p = d.data();
      const created = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate() : new Date();
      photos.push({ id: d.id, data: p.data, caption: p.caption || "", day: p.day || keyOf(created), createdAt: created });
    });
    byDay = new Map();
    // más viejas primero dentro de cada día
    [...photos].sort((a, b) => a.createdAt - b.createdAt).forEach((p) => {
      if (!byDay.has(p.day)) byDay.set(p.day, []);
      byDay.get(p.day).push(p);
    });
    renderAll();
  }, (err) => console.error(err));
}

function streak() {
  let n = 0;
  const d = new Date();
  if (!byDay.has(keyOf(d))) d.setDate(d.getDate() - 1); // si hoy todavía no subió, no corta la racha
  while (byDay.has(keyOf(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- Render ---------- */
function renderAll() { renderToday(); renderCalendar(); renderRecapTitle(); if (openDay) renderDay(); }

function renderToday() {
  const now = new Date(), tk = todayKey();
  $("todayWeekday").textContent = weekday(tk);
  $("todayDate").innerHTML = "";
  $("todayDate").append(now.getDate() + " de ");
  const em = document.createElement("em"); em.textContent = MESES[now.getMonth()];
  $("todayDate").append(em);

  const year = String(now.getFullYear());
  $("statStreak").textContent = streak();
  $("statDays").textContent = [...byDay.keys()].filter((k) => k.startsWith(year)).length;
  $("statTotal").textContent = photos.length;

  const stage = $("todayStage");
  stage.textContent = "";
  const list = byDay.get(tk);
  if (list && list.length) {
    const p = list[0];
    const hero = document.createElement("button");
    hero.type = "button"; hero.className = "hero";
    hero.style.setProperty("--rot", rotFor(tk) / 2 + "deg");
    hero.setAttribute("aria-label", "Ver las fotos de hoy");
    const frame = document.createElement("span"); frame.className = "frame";
    const img = document.createElement("img"); img.src = p.data; img.alt = p.caption || "Foto de hoy";
    const cap = document.createElement("span"); cap.className = "cap"; cap.textContent = p.caption || "";
    frame.append(img, cap);
    const tape = document.createElement("div"); tape.className = "tape";
    hero.append(frame, tape);
    hero.addEventListener("click", () => showDay(tk));
    stage.append(hero);
    if (list.length > 1) {
      const more = document.createElement("p"); more.className = "small center"; more.style.marginTop = "14px";
      more.textContent = "+" + (list.length - 1) + " más de hoy";
      stage.append(more);
    }
  } else {
    const box = document.createElement("div"); box.className = "today-empty";
    box.innerHTML = '<div class="big-emoji">📸</div><h3>Falta la foto de hoy</h3><p>Una foto, un momento. Guardá lo que más te gustó de este día.</p>';
    const b = document.createElement("button"); b.className = "btn primary"; b.type = "button"; b.textContent = "Subir la foto de hoy";
    b.addEventListener("click", () => $("picker").click());
    box.append(b);
    stage.append(box);
  }

  // Últimos días con foto (sin contar hoy)
  const recent = $("recent");
  recent.textContent = "";
  const keys = [...byDay.keys()].filter((k) => k !== tk).sort().reverse().slice(0, 14);
  keys.forEach((k) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "mini";
    b.style.setProperty("--rot", rotFor(k) + "deg");
    const img = document.createElement("img"); img.src = byDay.get(k)[0].data; img.alt = ""; img.loading = "lazy";
    const s = document.createElement("span"); s.textContent = fromKey(k).getDate() + " " + MESES[fromKey(k).getMonth()].slice(0, 3);
    b.append(img, s);
    b.addEventListener("click", () => showDay(k));
    recent.append(b);
  });
  $("empty").hidden = photos.length > 0;
  recent.parentElement.querySelector(".section-title").hidden = keys.length === 0;
}

function renderCalendar() {
  const y = cursor.getFullYear(), m = cursor.getMonth();
  $("monthName").textContent = MESES[m] + " " + y;
  const grid = $("calGrid");
  grid.textContent = "";
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // lunes primero
  const total = new Date(y, m + 1, 0).getDate();
  const tk = todayKey();
  let withPhoto = 0;
  for (let i = 0; i < lead; i++) { const e = document.createElement("div"); e.className = "day blank"; grid.append(e); }
  for (let d = 1; d <= total; d++) {
    const k = y + "-" + pad(m + 1) + "-" + pad(d);
    const list = byDay.get(k);
    const b = document.createElement("button"); b.type = "button"; b.className = "day";
    if (k === tk) b.classList.add("today");
    if (k > tk) b.classList.add("future");
    const n = document.createElement("span"); n.className = "n"; n.textContent = d;
    if (list && list.length) {
      withPhoto++;
      b.classList.add("has");
      const img = document.createElement("img"); img.src = list[0].data; img.alt = ""; img.loading = "lazy";
      b.append(img);
      if (list.length > 1) { const mu = document.createElement("span"); mu.className = "multi"; mu.textContent = "+" + (list.length - 1); b.append(mu); }
    }
    b.append(n);
    b.setAttribute("aria-label", d + " de " + MESES[m] + (list ? ", " + list.length + " foto(s)" : ""));
    if (k <= tk) b.addEventListener("click", () => showDay(k));
    grid.append(b);
  }
  $("monthCount").textContent = withPhoto + " de " + total + " días con foto";
}
$("prevMonth").addEventListener("click", () => { cursor.setMonth(cursor.getMonth() - 1); renderCalendar(); });
$("nextMonth").addEventListener("click", () => { cursor.setMonth(cursor.getMonth() + 1); renderCalendar(); });

/* ---------- Pestañas ---------- */
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  const v = t.dataset.view;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
  ["today", "calendar", "recap"].forEach((n) => { $("view-" + n).hidden = n !== v; });
  if (v !== "recap") stopRecap();
  window.scrollTo({ top: 0 });
}));

/* ---------- Día ---------- */
function showDay(k) { openDay = k; renderDay(); if (!$("dayView").open) $("dayView").showModal(); }
function renderDay() {
  const k = openDay;
  $("dayWeekday").textContent = weekday(k);
  $("dayTitle").textContent = longDate(k) + " " + fromKey(k).getFullYear();
  const box = $("dayPhotos");
  box.textContent = "";
  const list = byDay.get(k) || [];
  if (!list.length) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "No hay fotos este día."; box.append(p); }
  list.forEach((p) => {
    const fig = document.createElement("figure");
    fig.style.setProperty("--rot", rotFor(p.id) / 3 + "deg");
    const img = document.createElement("img"); img.src = p.data; img.alt = p.caption || "Foto";
    const fc = document.createElement("figcaption");
    const cap = document.createElement("span"); cap.className = "capt"; cap.textContent = p.caption;
    const del = document.createElement("button"); del.type = "button"; del.className = "del"; del.textContent = "Eliminar";
    del.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta foto?")) return;
      try { await deleteDoc(doc(db, "photos", p.id)); } catch (e) { console.error(e); alert("No se pudo eliminar."); }
    });
    fc.append(cap, del);
    fig.append(img, fc);
    box.append(fig);
  });
}
$("closeDay").addEventListener("click", () => { $("dayView").close(); openDay = null; });
$("dayView").addEventListener("close", () => { openDay = null; });
$("addToDay").addEventListener("click", () => { uploadDay = openDay; $("picker").click(); });

/* ---------- Subida ---------- */
$("fab").addEventListener("click", () => { uploadDay = null; $("picker").click(); });
$("picker").addEventListener("change", (e) => {
  pendingFiles = Array.from(e.target.files || []);
  e.target.value = "";
  if (!pendingFiles.length) return;
  const box = $("previews");
  box.textContent = "";
  pendingFiles.forEach((f) => { const im = document.createElement("img"); im.src = URL.createObjectURL(f); im.alt = ""; box.append(im); });
  $("caption").value = "";
  const tk = todayKey();
  $("dayInput").max = tk;
  $("dayInput").value = uploadDay || tk;
  $("uploadStatus").textContent = pendingFiles.length === 1 ? "1 foto lista" : pendingFiles.length + " fotos listas";
  $("confirmUpload").disabled = false;
  if ($("dayView").open) $("dayView").close();
  $("uploadSheet").showModal();
});
$("cancelUpload").addEventListener("click", () => { pendingFiles = []; $("uploadSheet").close(); });

$("confirmUpload").addEventListener("click", async () => {
  const caption = $("caption").value.trim();
  const day = $("dayInput").value || todayKey();
  if (day > todayKey()) { $("uploadStatus").textContent = "No se puede elegir un día que todavía no llegó."; return; }
  $("confirmUpload").disabled = true;
  try {
    for (let i = 0; i < pendingFiles.length; i++) {
      $("uploadStatus").textContent = "Subiendo " + (i + 1) + " de " + pendingFiles.length + "…";
      const data = await compress(pendingFiles[i]);
      await addDoc(collection(db, "photos"), { data, caption, day, createdAt: serverTimestamp(), by: auth.currentUser.uid });
    }
    pendingFiles = [];
    $("uploadSheet").close();
    cursor = fromKey(day); cursor.setDate(1); renderCalendar();
  } catch (err) {
    console.error(err);
    $("uploadStatus").textContent = "Algo falló al subir. Probá de nuevo.";
    $("confirmUpload").disabled = false;
  }
});

// Achica la foto (máx. 1100 px) y la pasa a JPEG para que entre en Firestore (~1 MB por documento).
async function compress(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  let max = 1100, quality = 0.78, out = "";
  for (let tries = 0; tries < 4; tries++) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", quality);
    if (out.length < 900000) return out;
    max *= 0.8; quality -= 0.08;
  }
  return out;
}

/* ---------- Video resumen del año ---------- */
const canvas = $("recapCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const SLIDE_MS = 1700, FADE_MS = 450, INTRO_MS = 2200, OUTRO_MS = 2600;
let recapRun = 0;           // id de la ejecución actual (para cancelar)
let recorder = null;
let lastUrl = null;

function renderRecapTitle() {
  const y = new Date().getFullYear();
  const n = [...byDay.keys()].filter((k) => k.startsWith(String(y))).length;
  $("recapTitle").textContent = "Tu " + y + " en fotos";
  if (!recapRun) {
    $("recapStatus").textContent = n ? n + (n === 1 ? " día" : " días") + " con foto este año" : "Subí fotos para armar el video";
    drawCover();
  }
}

function roundImg(img) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = img; }); }

function drawCover() {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#4A2B3B"); g.addColorStop(1, "#1F1519");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.fillStyle = "#F2A38F"; ctx.font = "500 44px Caveat, cursive";
  ctx.fillText("una foto por día", W / 2, H / 2 - 70);
  ctx.fillStyle = "#fff"; ctx.font = "600 78px Fraunces, serif"; ctx.fillText("Pic of", W / 2, H / 2 + 10);
  ctx.font = "italic 400 78px Fraunces, serif"; ctx.fillStyle = "#FFE1D8"; ctx.fillText("the Day", W / 2, H / 2 + 92);
  ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "500 30px 'DM Sans', sans-serif";
  ctx.fillText(String(new Date().getFullYear()), W / 2, H / 2 + 160);
}

function drawIntro(t) {
  drawCover();
  ctx.fillStyle = "rgba(31,21,25," + Math.max(0, 1 - t * 3) + ")"; ctx.fillRect(0, 0, W, H);
}

function drawPhoto(img, p, t, alpha) {
  // Ken Burns suave
  const zoom = 1.04 + 0.1 * t;
  const sc = Math.max(W / img.width, H / img.height) * zoom;
  const w = img.width * sc, h = img.height * sc;
  const x = (W - w) / 2 + (t - 0.5) * 26, y = (H - h) / 2 - (t - 0.5) * 20;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y, w, h);
  const sh = ctx.createLinearGradient(0, H * 0.62, 0, H);
  sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.72)");
  ctx.fillStyle = sh; ctx.fillRect(0, H * 0.62, W, H * 0.38);
  ctx.textAlign = "left"; ctx.fillStyle = "#fff";
  ctx.font = "italic 500 58px Fraunces, serif";
  const d = fromKey(p.day);
  ctx.fillText(d.getDate() + " de " + MESES[d.getMonth()], 38, H - 112);
  ctx.font = "500 40px Caveat, cursive"; ctx.fillStyle = "#FFD3C7";
  if (p.caption) ctx.fillText(p.caption, 38, H - 62);
  ctx.globalAlpha = 1;
}

function drawOutro(t, n, year) {
  drawCover();
  ctx.fillStyle = "rgba(31,21,25,.55)"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.fillStyle = "#fff";
  ctx.globalAlpha = Math.min(1, t * 3);
  ctx.font = "600 150px Fraunces, serif"; ctx.fillText(String(n), W / 2, H / 2 - 20);
  ctx.font = "italic 400 44px Fraunces, serif"; ctx.fillText(n === 1 ? "día guardado" : "días guardados", W / 2, H / 2 + 44);
  ctx.fillStyle = "#F2A38F"; ctx.font = "500 38px Caveat, cursive"; ctx.fillText("en " + year + " · y seguimos 💌", W / 2, H / 2 + 110);
  ctx.globalAlpha = 1;
}

function stopRecap() {
  recapRun = 0;
  if (recorder && recorder.state !== "inactive") { try { recorder.onstop = null; recorder.stop(); } catch (_) {} }
  recorder = null;
  $("recapBar").hidden = true;
  $("recapPlay").disabled = false;
  $("recapPlay").textContent = "Crear video";
  $("recapIdle").hidden = false;
  $("recapVideo").pause();
  $("recapVideo").hidden = true;
  canvas.hidden = false;
  renderRecapTitle();
}

$("recapPlay").addEventListener("click", async () => {
  const year = new Date().getFullYear();
  const keys = [...byDay.keys()].filter((k) => k.startsWith(String(year))).sort();
  if (!keys.length) { $("recapStatus").textContent = "Todavía no hay fotos de este año."; return; }

  if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
  $("recapDownload").hidden = true;
  $("recapVideo").hidden = true; $("recapVideo").removeAttribute("src");
  canvas.hidden = false; $("recapIdle").hidden = true; $("recapBar").hidden = false;
  $("recapPlay").disabled = true; $("recapPlay").textContent = "Creando…";

  const run = ++recapRun;
  const slides = keys.map((k) => byDay.get(k)[0]);
  const total = INTRO_MS + slides.length * SLIDE_MS + OUTRO_MS;

  // Grabación (si el navegador la soporta)
  let chunks = [];
  const canRecord = typeof MediaRecorder !== "undefined" && canvas.captureStream;
  let mime = "";
  if (canRecord) {
    mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    try {
      recorder = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.start(250);
    } catch (e) { console.error(e); recorder = null; }
  }

  $("recapStatus").textContent = "Armando tu video… no cierres esta pantalla";

  let cur = null, prev = null, curIdx = -1;
  const t0 = performance.now();
  const frame = async () => {
    if (run !== recapRun) return;
    const el = performance.now() - t0;
    $("recapBarFill").style.width = Math.min(100, (el / total) * 100) + "%";
    ctx.fillStyle = "#1F1519"; ctx.fillRect(0, 0, W, H);

    if (el < INTRO_MS) {
      drawIntro(el / INTRO_MS);
    } else if (el < INTRO_MS + slides.length * SLIDE_MS) {
      const idx = Math.floor((el - INTRO_MS) / SLIDE_MS);
      if (idx !== curIdx) {
        prev = cur; curIdx = idx;
        cur = await roundImg(slides[idx].data);
        if (run !== recapRun) return;
      }
      const t = ((el - INTRO_MS) % SLIDE_MS) / SLIDE_MS;
      if (prev && idx > 0 && t * SLIDE_MS < FADE_MS) {
        drawPhoto(prev, slides[idx - 1], 1, 1);
        if (cur) drawPhoto(cur, slides[idx], t, t * SLIDE_MS / FADE_MS);
      } else if (cur) {
        drawPhoto(cur, slides[idx], t, 1);
      }
    } else if (el < total) {
      drawOutro((el - INTRO_MS - slides.length * SLIDE_MS) / OUTRO_MS, keys.length, year);
    } else {
      return finish(run, chunks, mime);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});

function finish(run, chunks, mime) {
  if (run !== recapRun) return;
  const done = (blob) => {
    $("recapBar").hidden = true;
    $("recapPlay").disabled = false; $("recapPlay").textContent = "Ver de nuevo";
    if (blob) {
      lastUrl = URL.createObjectURL(blob);
      const v = $("recapVideo");
      v.src = lastUrl; v.hidden = false; canvas.hidden = true; v.play().catch(() => {});
      const a = $("recapDownload");
      a.href = lastUrl; a.download = "pic-of-the-day-" + new Date().getFullYear() + (blob.type.includes("mp4") ? ".mp4" : ".webm");
      a.hidden = false;
      $("recapStatus").textContent = "¡Listo! Podés descargarlo y compartirlo.";
    } else {
      $("recapStatus").textContent = "Tu navegador no puede guardar el video, pero lo viste en pantalla.";
    }
    recapRun = 0;
  };
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = () => done(new Blob(chunks, { type: mime || "video/webm" }));
    recorder.stop();
    recorder = null;
  } else done(null);
}
