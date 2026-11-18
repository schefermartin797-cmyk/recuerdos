import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let unsubscribe = null;
let pendingFiles = [];
let currentPhoto = null;

/* ---------- Login ---------- */
onAuthStateChanged(auth, (user) => {
  $("login").hidden = !!user;
  $("app").hidden = !user;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (user) listenPhotos();
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginError").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (err) {
    $("loginError").textContent = "No pudimos entrar. Revisá el email y la contraseña.";
  }
});
$("logout").addEventListener("click", () => signOut(auth));

/* ---------- Galería ---------- */
function listenPhotos() {
  const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(q, (snap) => {
    const grid = $("grid");
    grid.textContent = "";
    $("empty").hidden = !snap.empty;
    snap.forEach((d, i) => {
      const p = d.data();
      const cell = document.createElement("div");
      cell.className = "cell";

      const btn = document.createElement("button");
      btn.className = "polaroid";
      btn.type = "button";
      btn.setAttribute("aria-label", "Abrir foto" + (p.caption ? ": " + p.caption : ""));
      btn.style.setProperty("--rot", rotFor(d.id) + "deg");

      const img = document.createElement("img");
      img.src = p.data;
      img.alt = p.caption || "Foto";
      img.loading = "lazy";
      const cap = document.createElement("span");
      cap.className = "cap";
      cap.textContent = p.caption || "";
      btn.append(img, cap);
      btn.addEventListener("click", () => openViewer(d.id, p));

      const tape = document.createElement("div");
      tape.className = "tape";
      tape.style.setProperty("--tape", rotFor(d.id + "t") * 1.2 + "deg");

      cell.append(btn, tape);
      grid.append(cell);
    });
  }, (err) => console.error(err));
}

// Rotación estable por foto (entre -5 y 5 grados)
function rotFor(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return (h % 11) - 5;
}

/* ---------- Visor ---------- */
function openViewer(id, p) {
  currentPhoto = id;
  $("viewerImg").src = p.data;
  $("viewerImg").alt = p.caption || "Foto";
  $("viewerCaption").textContent = p.caption || "";
  const t = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate() : null;
  $("viewerDate").textContent = t ? t.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "";
  $("viewer").showModal();
}
$("closeViewer").addEventListener("click", () => $("viewer").close());
$("deletePhoto").addEventListener("click", async () => {
  if (!currentPhoto || !confirm("¿Eliminar esta foto?")) return;
  await deleteDoc(doc(db, "photos", currentPhoto));
  $("viewer").close();
});

/* ---------- Subida ---------- */
$("picker").addEventListener("change", (e) => {
  pendingFiles = Array.from(e.target.files || []);
  e.target.value = "";
  if (!pendingFiles.length) return;
  const box = $("previews");
  box.textContent = "";
  pendingFiles.forEach((f) => {
    const im = document.createElement("img");
    im.src = URL.createObjectURL(f);
    im.alt = "";
    box.append(im);
  });
  $("caption").value = "";
  $("uploadStatus").textContent = pendingFiles.length === 1 ? "1 foto lista" : pendingFiles.length + " fotos listas";
  $("confirmUpload").disabled = false;
  $("uploadSheet").showModal();
});
$("cancelUpload").addEventListener("click", () => { pendingFiles = []; $("uploadSheet").close(); });

$("confirmUpload").addEventListener("click", async () => {
  const caption = $("caption").value.trim();
  $("confirmUpload").disabled = true;
  try {
    for (let i = 0; i < pendingFiles.length; i++) {
      $("uploadStatus").textContent = "Subiendo " + (i + 1) + " de " + pendingFiles.length + "…";
      const data = await compress(pendingFiles[i]);
      await addDoc(collection(db, "photos"), {
        data, caption, createdAt: serverTimestamp(), by: auth.currentUser.uid
      });
    }
    pendingFiles = [];
    $("uploadSheet").close();
  } catch (err) {
    console.error(err);
    $("uploadStatus").textContent = "Algo falló al subir. Probá de nuevo.";
    $("confirmUpload").disabled = false;
  }
});

// Achica la foto (máx. 1100 px) y la pasa a JPEG para que entre en Firestore (límite ~1 MB por documento).
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
