// Pichanga Cerca — app principal (Firebase Auth + Firestore + Google Maps)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, query, where, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const CFG = window.APP_CONFIG || {};
const CENTRO = CFG.centro || { lat: -12.1219, lng: -77.0300 };
const RADIO = CFG.radioKm || 3;
const ADMINS = (CFG.adminEmails || []).map(e => e.toLowerCase().trim());
// Nombres de las canchas ficticias de ejemplo (para poder borrarlas en bloque)
const EJEMPLOS = ["Loza Parque Los Olivos", "Sintética El Golazo", "Loza Vecinal San Martín", "Complejo La Bombonera", "Loza Parque Central", "Sintética Tiki Taka", "Loza Colegio Santa Rosa", "Cancha El Potrero"];

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const isoDate = d => d.toLocaleDateString("en-CA");
const diaMas = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
const hoy = () => diaMas(0);
function diaLabel(f) {
  if (f === hoy()) return "Hoy"; if (f === diaMas(1)) return "Mañana";
  const [y, m, d] = f.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
}
const inicioMs = (fecha, hora) => { const [y, m, d] = fecha.split("-").map(Number); const [h, mi] = hora.split(":").map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };
function km(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
let toastT;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3400); }
const COLORS = ["#136b40", "#2f7bf6", "#e0679a", "#d08a1b", "#0e8a8a", "#6d3fd8", "#c2410c"];
const colorDe = id => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const ini = n => String(n || "?").split(" ").filter(Boolean).map(s => s[0]).slice(0, 2).join("").toUpperCase();
function avatar(nombre, foto, id, size) {
  const st = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px;` : "";
  if (foto && /^https:\/\//.test(foto)) return `<img class="av" style="${st}" src="${esc(foto)}" alt="" referrerpolicy="no-referrer" data-ini="${esc(ini(nombre))}" data-c="${colorDe(id)}" onerror="window.__avFallback(this)">`;
  return `<span class="av" style="${st}background:${colorDe(id)}">${esc(ini(nombre))}</span>`;
}

window.__avFallback = img => { const sp = document.createElement("span"); sp.className = "av"; sp.style.cssText = img.style.cssText; sp.style.background = img.dataset.c; sp.textContent = img.dataset.ini; img.replaceWith(sp); };

/* ---------- configuración faltante ---------- */
const fb = CFG.firebase || {};
if (!fb.apiKey || /PEGA_AQUI/.test(fb.apiKey + fb.projectId)) {
  document.body.innerHTML = `<div class="setup"><h2>Falta configurar Firebase</h2>
    <p>Abre <code>public/config.js</code> y pega los datos de tu proyecto de Firebase (<code>firebaseConfig</code>).
    Los pasos están en <code>README.md</code>.</p></div>`;
  throw new Error("APP_CONFIG.firebase sin configurar");
}
if (location.protocol === "file:") {
  document.body.innerHTML = `<div class="setup"><h2>Ábrela desde un servidor</h2>
    <p>El login con Google no funciona abriendo el archivo con doble clic. En la carpeta del proyecto ejecuta:</p>
    <p><code>npx serve public</code> &nbsp;o&nbsp; <code>python -m http.server 5000 -d public</code></p>
    <p>y abre <code>http://localhost:3000</code> (o <code>:5000</code>).</p></div>`;
  throw new Error("file://");
}

/* ---------- Firebase ---------- */
const app = initializeApp(fb);
const auth = getAuth(app);
// Caché local persistente: al volver a abrir la app solo se descargan los cambios,
// lo que reduce mucho las lecturas facturables de Firestore.
let db;
try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { console.warn("Sin caché persistente:", e); db = getFirestore(app); }
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/* ---------- estado ---------- */
const S = {
  user: null, perfil: null, isAdmin: false,
  canchas: [], partidos: [], inscritos: [], usuarios: [],
  cargado: { canchas: false, partidos: false },
  modo: "jugar", tab: null, sel: null, cant: {}, busy: false,
  addMode: false, newLatLng: null, ME: { ...CENTRO }, gps: false,
  cand: null, candBusy: false, candMsg: "", editId: null, moving: null,
};
const unsub = { inscritos: null, usuarios: null, perfil: null };

/* ---------- autenticación ---------- */
async function login() {
  try { await signInWithPopup(auth, provider); cerrar("mLogin"); }
  catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return signInWithRedirect(auth, provider);
    if (e && e.code === "auth/unauthorized-domain") return toast("Este dominio no está autorizado en Firebase → Authentication → Settings.");
    if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) return;
    console.error(e); toast("No se pudo iniciar sesión. Intenta de nuevo.");
  }
}
function pedirLogin() { if (S.user) return true; abrir("mLogin"); return false; }
document.addEventListener("click", e => { if (e.target.closest("[data-login]")) login(); if (e.target.closest("[data-logout]")) signOut(auth); });

onAuthStateChanged(auth, async u => {
  S.user = u;
  S.isAdmin = !!(u && u.emailVerified && u.email && ADMINS.includes(u.email.toLowerCase()));
  Object.values(unsub).forEach(f => f && f()); unsub.inscritos = unsub.usuarios = unsub.perfil = null;
  S.inscritos = []; S.usuarios = []; S.perfil = null;
  if (!S.isAdmin && S.modo === "admin") S.modo = "jugar", S.tab = null;
  if (u) {
    try { await setDoc(doc(db, "usuarios", u.uid), { nombre: u.displayName || "Jugador", foto: u.photoURL || "", ultimoAcceso: serverTimestamp() }, { merge: true }); }
    catch (e) { console.warn("perfil", e); }
    unsub.perfil = onSnapshot(doc(db, "usuarios", u.uid), s => { S.perfil = s.exists() ? s.data() : null; renderAll(); }, err);
    unsub.inscritos = onSnapshot(query(collection(db, "inscritos"), where("inicio", ">=", Date.now() - 3 * 3600 * 1000)), s => { S.inscritos = s.docs.map(limpiarInscrito).filter(Boolean); renderAll(); }, err);
    if (S.isAdmin) unsub.usuarios = onSnapshot(collection(db, "usuarios"), s => { S.usuarios = s.docs.map(d => ({ id: d.id, ...d.data() })); renderAll(); }, err);
    cerrar("mLogin");
  }
  renderAll();
});
function err(e) { console.error(e); setStatus(e && e.code === "permission-denied" ? "Sin permiso para leer datos. ¿Publicaste las reglas de Firestore?" : "Problema de conexión con la base de datos."); }

/* ---------- datos en tiempo real (públicos) ---------- */
onSnapshot(collection(db, "canchas"), s => {
  S.canchas = s.docs.map(limpiarCancha).filter(Boolean); S.cargado.canchas = true; renderAll(); encuadrar();
}, err);
onSnapshot(query(collection(db, "partidos"), where("inicio", ">=", Date.now() - 3 * 3600 * 1000)), s => {
  S.partidos = s.docs.map(limpiarPartido).filter(Boolean); S.cargado.partidos = true; renderAll();
}, err);

function limpiarCancha(d) {
  const x = d.data(); if (!x || typeof x.lat !== "number" || typeof x.lng !== "number") return null;
  return { id: d.id, nombre: String(x.nombre || "Cancha").slice(0, 50), tipo: String(x.tipo || "Loza"), precio: String(x.precio || ""), dir: String(x.dir || ""), lat: x.lat, lng: x.lng,
    fuente: x.fuente === "osm" ? "osm" : "", osmId: String(x.osmId || ""), ejemplo: x.ejemplo === true || EJEMPLOS.includes(String(x.nombre)) };
}
function limpiarPartido(d) {
  const x = d.data();
  if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.fecha || "") || !/^\d{2}:\d{2}$/.test(x.hora || "")) return null;
  return { id: d.id, canchaId: String(x.canchaId || ""), creador: String(x.creador || ""), creadorNombre: String(x.creadorNombre || "Organizador"), creadorFoto: String(x.creadorFoto || ""),
    equipo: String(x.equipo || "Partido").slice(0, 40), fecha: x.fecha, hora: x.hora, inicio: Number(x.inicio) || inicioMs(x.fecha, x.hora),
    somos: num(x.somos, 0, 40, 0), necesitan: num(x.necesitan, 1, 40, 1), nota: String(x.nota || "").slice(0, 160), estado: x.estado === "cerrado" ? "cerrado" : "abierto" };
}
function limpiarInscrito(d) {
  const x = d.data(); if (!x || !x.pid || !x.uid) return null;
  return { id: d.id, pid: String(x.pid), uid: String(x.uid), nombre: String(x.nombre || "Jugador"), foto: String(x.foto || ""), cantidad: num(x.cantidad, 1, 30, 1) };
}

/* ---------- cálculos ---------- */
const cancha = id => S.canchas.find(c => c.id === id);
const distKm = c => km(S.ME, c);
const inscritosDe = pid => S.inscritos.filter(i => i.pid === pid);
const sumados = pid => inscritosDe(pid).reduce((a, i) => a + i.cantidad, 0);
const faltan = p => Math.max(0, p.necesitan - sumados(p.id));
const abierto = p => p.estado !== "cerrado" && faltan(p) > 0;
const miInsc = pid => S.user && S.inscritos.find(i => i.pid === pid && i.uid === S.user.uid);
const bloqueado = () => !!(S.perfil && S.perfil.bloqueado);
const vigentes = () => S.partidos.filter(p => cancha(p.canchaId) && p.inicio > Date.now() - 3600 * 1000).sort((a, b) => a.inicio - b.inicio);
function estadoCancha(c) {
  const ps = vigentes().filter(p => p.canchaId === c.id), ab = ps.filter(abierto);
  return { ps, ab, faltanTot: ab.reduce((a, p) => a + faltan(p), 0), color: ab.length ? "#136b40" : ps.length ? "#f08a24" : "#9aa39c" };
}

/* =========================================================
   MAPA — Google Maps (con key) o OpenStreetMap (respaldo)
   ========================================================= */
const MAP = { kind: null, obj: null, markers: {}, me: null, popup: null, cand: [] };
function pinSVG(color, n, sel) {
  const s = sel ? 1.2 : 1, w = 44 * s, h = 58 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 44 58">
    <path d="M20 56 C14 44 2 36 2 22 A18 18 0 1 1 38 22 C38 36 26 44 20 56Z" fill="${color}" stroke="${sel ? "#c6f432" : "#fff"}" stroke-width="${sel ? 4 : 2.5}"/>
    <rect x="11" y="15" width="18" height="13" rx="1.5" fill="none" stroke="#fff" stroke-width="1.6"/>
    <line x1="20" y1="15" x2="20" y2="28" stroke="#fff" stroke-width="1.4"/><circle cx="20" cy="21.5" r="2.6" fill="none" stroke="#fff" stroke-width="1.3"/>
    ${n ? `<circle cx="34" cy="10" r="9" fill="#c6f432" stroke="#0d4d2e" stroke-width="2"/><text x="34" y="14" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="11" fill="#0d4d2e">${n}</text>` : ""}
  </svg>`;
}
const svgUrl = s => "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(s);
function popupHTML(c) {
  const { ps } = estadoCancha(c);
  const rows = ps.length ? ps.slice(0, 5).map(p => `<div class="r"><span>${esc(diaLabel(p.fecha))} ${esc(p.hora)} · ${esc(p.equipo)}</span>${abierto(p) ? `<span class="f">faltan ${faltan(p)}</span>` : `<span class="x">${p.estado === "cerrado" ? "cerrado" : "lleno"}</span>`}</div>`).join("") : `<div class="r"><span>Sin partidos publicados</span></div>`;
  return `<div class="iw"><b>${esc(c.nombre)}</b><div class="t">${esc(c.tipo)} · ${esc(c.precio)} · ${distKm(c).toFixed(1)} km</div>${rows}</div>`;
}
function cargarMapa() { if (CFG.googleMapsApiKey) cargarGoogle(CFG.googleMapsApiKey); else cargarLeaflet(); }
function cargarGoogle(key) {
  window.gm_authFailure = () => { toast("Google Maps rechazó la API key; usando OpenStreetMap."); destruirMapa(); cargarLeaflet(); };
  window.__initGoogle = () => {
    destruirMapa(); MAP.kind = "google"; $("#map").innerHTML = "";
    MAP.obj = new google.maps.Map($("#map"), {
      center: S.ME, zoom: 15, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: "greedy",
      styles: [{ featureType: "poi.business", stylers: [{ visibility: "off" }] }, { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#cfe6bf" }] }],
    });
    MAP.popup = new google.maps.InfoWindow();
    MAP.obj.addListener("click", e => onMapClick(e.latLng.lat(), e.latLng.lng()));
    dibujarMe(); dibujarMarkers(); dibujarCandidatos(); renderStatus(); encuadrar();
  };
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__initGoogle&loading=async&v=weekly&language=es&region=PE`;
  s.async = true; s.onerror = () => { toast("No se pudo cargar Google Maps; usando OpenStreetMap."); cargarLeaflet(); };
  document.head.appendChild(s);
}
function cargarLeaflet() {
  if (MAP.kind === "osm") return;
  const go = () => {
    if (!window.L) { $("#map").innerHTML = `<div class="mapmsg">No se pudo cargar el mapa.<br>El panel sigue funcionando.</div>`; return; }
    destruirMapa(); MAP.kind = "osm"; $("#map").innerHTML = "";
    MAP.obj = L.map("map").setView([S.ME.lat, S.ME.lng], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(MAP.obj);
    MAP.obj.on("click", e => onMapClick(e.latlng.lat, e.latlng.lng));
    dibujarMe(); dibujarMarkers(); dibujarCandidatos(); renderStatus(); encuadrar();
  };
  if (window.L) return go();
  const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = go; s.onerror = go; document.head.appendChild(s);
}
function quitar(x) { if (!x) return; MAP.kind === "google" ? x.setMap(null) : x.remove(); }
function destruirMapa() {
  Object.values(MAP.markers).forEach(quitar); MAP.markers = {};
  (MAP.me || []).forEach(quitar); MAP.me = null;
  if (MAP.kind === "osm" && MAP.obj) MAP.obj.remove();
  MAP.obj = null; MAP.kind = null;
}
function dibujarMe() {
  if (!MAP.obj) return;
  (MAP.me || []).forEach(quitar);
  if (MAP.kind === "google") {
    MAP.me = [
      new google.maps.Circle({ map: MAP.obj, center: S.ME, radius: RADIO * 1000, strokeColor: "#2f7bf6", strokeOpacity: .35, strokeWeight: 1, fillColor: "#2f7bf6", fillOpacity: .05, clickable: false }),
      new google.maps.Marker({ map: MAP.obj, position: S.ME, title: "Tú estás aquí", zIndex: 1, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#2f7bf6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 } }),
    ];
  } else {
    MAP.me = [
      L.circle([S.ME.lat, S.ME.lng], { radius: RADIO * 1000, color: "#2f7bf6", weight: 1, opacity: .4, fillOpacity: .05, interactive: false }).addTo(MAP.obj),
      L.circleMarker([S.ME.lat, S.ME.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2f7bf6", fillOpacity: 1 }).bindTooltip("Tú estás aquí").addTo(MAP.obj),
    ];
  }
}
function dibujarMarkers() {
  if (!MAP.obj) return;
  const vivos = new Set();
  S.canchas.forEach(c => {
    vivos.add(c.id);
    const { color, faltanTot } = estadoCancha(c), sel = S.sel === c.id;
    const svg = pinSVG(color, faltanTot, sel), key = color + faltanTot + sel;
    let m = MAP.markers[c.id];
    if (MAP.kind === "google") {
      const icon = { url: svgUrl(svg), scaledSize: new google.maps.Size(sel ? 53 : 44, sel ? 70 : 58), anchor: new google.maps.Point(sel ? 24 : 20, sel ? 67 : 56) };
      if (!m) { m = new google.maps.Marker({ map: MAP.obj, position: { lat: c.lat, lng: c.lng }, title: c.nombre, icon }); m.addListener("click", () => seleccionar(c.id)); MAP.markers[c.id] = m; }
      else if (m.__k !== key) m.setIcon(icon);
      if (S.moving !== c.id && (m.__lat !== c.lat || m.__lng !== c.lng)) m.setPosition({ lat: c.lat, lng: c.lng });
      m.setZIndex(sel ? 100 : 10);
    } else {
      const icon = L.divIcon({ html: svg, className: "", iconSize: sel ? [53, 70] : [44, 58], iconAnchor: sel ? [24, 67] : [20, 56], popupAnchor: [0, -56] });
      if (!m) { m = L.marker([c.lat, c.lng], { icon, title: c.nombre }).addTo(MAP.obj); m.on("click", () => seleccionar(c.id)); MAP.markers[c.id] = m; }
      else if (m.__k !== key) m.setIcon(icon);
      if (S.moving !== c.id && (m.__lat !== c.lat || m.__lng !== c.lng)) m.setLatLng([c.lat, c.lng]);
      m.setZIndexOffset(sel ? 1000 : 0);
    }
    m.__k = key; if (S.moving !== c.id) { m.__lat = c.lat; m.__lng = c.lng; }
  });
  Object.keys(MAP.markers).forEach(id => { if (!vivos.has(id)) { quitar(MAP.markers[id]); delete MAP.markers[id]; } });
}
function abrirPopup(c) {
  if (!MAP.obj || !MAP.markers[c.id]) return;
  if (MAP.kind === "google") { MAP.popup.setContent(popupHTML(c)); MAP.popup.open({ map: MAP.obj, anchor: MAP.markers[c.id] }); }
  else MAP.markers[c.id].bindPopup(popupHTML(c)).openPopup();
}
let encuadrado = false;
// Ajusta el mapa para que se vean tu ubicación y las canchas más cercanas (una sola vez)
function encuadrar(forzar) {
  if (!MAP.obj || !S.canchas.length || (encuadrado && !forzar)) return;
  const cerca = S.canchas.slice().sort((a, b) => distKm(a) - distKm(b)).slice(0, 4);
  const pts = [S.ME, ...cerca];
  if (MAP.kind === "google") {
    const b = new google.maps.LatLngBounds(); pts.forEach(p => b.extend(p));
    MAP.obj.fitBounds(b, 60);
  } else {
    MAP.obj.fitBounds(pts.map(p => [p.lat, p.lng]), { padding: [50, 50], maxZoom: 16 });
  }
  encuadrado = true;
}
function panTo(p) { if (!MAP.obj || !p) return; MAP.kind === "google" ? MAP.obj.panTo(p) : MAP.obj.panTo([p.lat, p.lng]); }
function usarGPS(silencioso) {
  if (!navigator.geolocation) return silencioso || toast("Tu navegador no permite ubicación.");
  navigator.geolocation.getCurrentPosition(pos => {
    S.ME = { lat: pos.coords.latitude, lng: pos.coords.longitude }; S.gps = true;
    dibujarMe(); renderAll(); encuadrar(true);
    if (!silencioso) toast("Ubicación actualizada.");
  }, () => silencioso || toast("No se pudo obtener tu ubicación."), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
}
$("#gpsBtn").onclick = () => usarGPS(false);
function onMapClick(lat, lng) {
  if (!S.addMode) return;
  S.newLatLng = { lat, lng }; S.editId = null;
  $("#fcTitle").textContent = "Nueva cancha"; $("#fcSubmit").textContent = "Agregar cancha";
  $("#fcCoords").textContent = `Ubicación: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  $("#fCancha").reset(); $("#fcPrecio").value = "Gratis";
  setAddMode(false); abrir("mCancha"); setTimeout(() => $("#fcNombre").focus(), 50);
}
function setAddMode(on) { S.addMode = on; $("#addMode").classList.toggle("on", on); }
$("#addCancel").onclick = () => { setAddMode(false); renderPanel(); };

/* ---------- editar datos y mover el pin (admin) ---------- */
function editarCancha(id) {
  const c = cancha(id); if (!c) return;
  S.editId = id; S.newLatLng = null;
  $("#fcTitle").textContent = "Editar cancha"; $("#fcSubmit").textContent = "Guardar cambios";
  $("#fcNombre").value = c.nombre; $("#fcTipo").value = c.tipo; $("#fcPrecio").value = c.precio; $("#fcDir").value = c.dir;
  $("#fcCoords").textContent = `Ubicación: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · para cambiarla usa "Mover pin"`;
  abrir("mCancha"); setTimeout(() => $("#fcNombre").focus(), 50);
}
function moverPin(id) {
  const c = cancha(id), m = MAP.markers[id]; if (!c || !m) return toast("El mapa aún no carga.");
  terminarMover(false);
  S.moving = id;
  if (MAP.kind === "google") { MAP.popup && MAP.popup.close(); m.setDraggable(true); MAP.obj.setZoom(Math.max(MAP.obj.getZoom(), 18)); MAP.obj.panTo(c); }
  else { m.closePopup(); m.dragging.enable(); MAP.obj.setView([c.lat, c.lng], Math.max(MAP.obj.getZoom(), 18)); }
  $("#moveBar").classList.add("on");
}
function terminarMover(guardar) {
  const id = S.moving; if (!id) return;
  const m = MAP.markers[id], c = cancha(id);
  let pos = null;
  if (m) {
    if (MAP.kind === "google") { const p = m.getPosition(); pos = { lat: p.lat(), lng: p.lng() }; m.setDraggable(false); }
    else { const p = m.getLatLng(); pos = { lat: p.lat, lng: p.lng }; m.dragging.disable(); }
  }
  S.moving = null; $("#moveBar").classList.remove("on");
  if (guardar && pos && c && (pos.lat !== c.lat || pos.lng !== c.lng)) {
    conBusy(() => updateDoc(doc(db, "canchas", id), { lat: pos.lat, lng: pos.lng }), "Ubicación actualizada.");
  } else { dibujarMarkers(); }
}
$("#moveSave").onclick = () => terminarMover(true);
$("#moveCancel").onclick = () => terminarMover(false);

/* ---------- buscador de lugares (OpenStreetMap Nominatim) ---------- */
let qTimer = null, qUltima = 0, qCtrl = null;
function buscarLugar(texto) {
  const q = texto.trim(); const box = $("#qres");
  if (q.length < 3) { box.classList.remove("on"); return; }
  const espera = Math.max(0, 1100 - (Date.now() - qUltima)); // máximo 1 consulta por segundo (política de Nominatim)
  clearTimeout(qTimer);
  qTimer = setTimeout(async () => {
    qUltima = Date.now();
    if (qCtrl) qCtrl.abort(); qCtrl = new AbortController();
    const d = 0.25, vb = `${S.ME.lng - d},${S.ME.lat + d},${S.ME.lng + d},${S.ME.lat - d}`;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=pe&accept-language=es&viewbox=${vb}&q=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(url, { signal: qCtrl.signal }); const xs = r.ok ? await r.json() : [];
      box.innerHTML = xs.length ? xs.map((x, i) => {
        const partes = String(x.display_name || "").split(", ");
        return `<button data-i="${i}" data-lat="${Number(x.lat)}" data-lng="${Number(x.lon)}"><b>${esc(partes[0])}</b><small>${esc(partes.slice(1, 4).join(", "))}</small></button>`;
      }).join("") : `<div class="none">Sin resultados. Prueba con otro nombre o agrega el distrito.</div>`;
      box.classList.add("on");
    } catch (e) { if (e.name !== "AbortError") { box.innerHTML = `<div class="none">No se pudo buscar. Intenta de nuevo.</div>`; box.classList.add("on"); } }
  }, Math.max(espera, 450));
}
$("#q").addEventListener("input", e => buscarLugar(e.target.value));
$("#q").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); const b = $("#qres button"); if (b && $("#qres").classList.contains("on")) b.click(); else buscarLugar(e.target.value); }
  if (e.key === "Escape") $("#qres").classList.remove("on");
});
$("#qres").addEventListener("click", e => {
  const b = e.target.closest("button[data-lat]"); if (!b || !MAP.obj) return;
  const p = { lat: Number(b.dataset.lat), lng: Number(b.dataset.lng) };
  if (MAP.kind === "google") { MAP.obj.setZoom(17); MAP.obj.panTo(p); } else MAP.obj.setView([p.lat, p.lng], 17);
  $("#qres").classList.remove("on"); $("#q").blur();
  if (S.addMode) toast("Ahora haz clic sobre la cancha.");
});
document.addEventListener("click", e => { if (!e.target.closest("#search")) $("#qres").classList.remove("on"); });

/* =========================================================
   INTERFAZ
   ========================================================= */
const MODOS = [["jugar", "⚽ Jugar"], ["organizar", "📣 Organizar"], ["admin", "🛡️ Admin"]];
const TABS = {
  jugar: [["cerca", "Cerca de ti"], ["mios", "Mis partidos"]],
  organizar: [["publicados", "Mis partidos publicados"]],
  admin: [["resumen", "Resumen"], ["partidos", "Partidos"], ["canchas", "Canchas"], ["usuarios", "Usuarios"]],
};
function renderHeader() {
  $("#modes").innerHTML = MODOS.filter(([k]) => k !== "admin" || S.isAdmin)
    .map(([k, l]) => `<button class="mode${k === "admin" ? " adm" : ""}${S.modo === k ? " on" : ""}" data-m="${k}">${l}</button>`).join("");
  const u = S.user;
  $("#account").innerHTML = u
    ? `<div class="uchip">${avatar(u.displayName, u.photoURL, u.uid)}<div class="nm">${esc(u.displayName || "Jugador")}<small>${S.isAdmin ? "Administrador" : esc(u.email || "")}</small></div></div><button class="out" data-logout>Salir</button>`
    : `<button class="gbtn" data-login style="padding:7px 14px;font-size:13px"><svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Entrar con Google</button>`;
}
$("#modes").onclick = e => { const b = e.target.closest("[data-m]"); if (!b) return; terminarMover(false); S.modo = b.dataset.m; S.tab = null; S.sel = null; setAddMode(false); renderAll(); };
function renderTabs() {
  const t = TABS[S.modo]; if (!S.tab || !t.some(([k]) => k === S.tab)) S.tab = t[0][0];
  $("#tabs").innerHTML = t.map(([k, l]) => `<button class="chip${S.tab === k && !S.sel ? " on" : ""}" data-tab="${k}">${l}</button>`).join("")
    + (S.modo === "organizar" ? `<button class="btn sm" style="margin-left:auto" data-a="nuevo">+ Publicar</button>` : "");
}
$("#tabs").onclick = e => {
  const b = e.target.closest("[data-tab]"); if (b) { S.tab = b.dataset.tab; S.sel = null; if (MAP.popup) MAP.popup.close(); renderAll(); return; }
  if (e.target.closest("[data-a=nuevo]")) abrirPartido();
};
function setStatus(t) { $("#status").textContent = t; }
function renderStatus() {
  if (!S.cargado.canchas || !S.cargado.partidos) return setStatus("Conectando…");
  setStatus(`● En vivo · ${MAP.kind === "google" ? "Google Maps" : MAP.kind === "osm" ? "OpenStreetMap" : "sin mapa"}${S.gps ? " · ubicación GPS" : " · ubicación aproximada"}`);
}
function seleccionar(id) {
  S.sel = id; const c = cancha(id);
  if (c) { panTo(c); abrirPopup(c); }
  renderAll(); $("#panel").scrollTop = 0;
}

/* ---- tarjeta de partido ---- */
function tarjeta(p, opts = {}) {
  const c = cancha(p.canchaId), f = faltan(p), sum = sumados(p.id), total = p.somos + p.necesitan;
  const uid = S.user && S.user.uid, esMio = p.creador === uid, ins = inscritosDe(p.id);
  const derecha = p.estado === "cerrado" ? `<div class="n closed">Cerrado</div>` : f > 0 ? `<div class="n">${f}</div><small>faltan</small>` : `<div class="n full">Lleno</div>`;
  let acciones = "", extra = "";
  const dis = S.busy ? "disabled" : "";

  if (S.modo === "jugar") {
    const mia = miInsc(p.id), maxC = f + (mia ? mia.cantidad : 0);
    const cant = Math.min(Math.max(1, S.cant[p.id] || (mia ? mia.cantidad : 1)), Math.max(1, maxC));
    if (!S.user) acciones = abierto(p) ? `<button class="btn" data-login>Entrar para sumarme</button>` : `<div class="warn">${p.estado === "cerrado" ? "Convocatoria cerrada" : "Equipo completo"}</div>`;
    else if (esMio) acciones = `<div class="going">Este partido lo organizas tú</div>`;
    else if (bloqueado()) acciones = `<div class="warn">Tu cuenta está suspendida.</div>`;
    else if (mia) {
      acciones = `<div class="going">✓ Vas${mia.cantidad > 1 ? ` con ${mia.cantidad - 1} más` : ""}</div>
        <div class="step"><button data-a="menos" data-p="${p.id}" ${cant <= 1 ? "disabled" : ""}>−</button><span>${cant}</span><button data-a="mas" data-p="${p.id}" ${cant >= maxC ? "disabled" : ""}>+</button></div>
        ${cant !== mia.cantidad ? `<button class="btn" data-a="unirse" data-p="${p.id}" ${dis}>Guardar</button>` : ""}
        <button class="btn danger" data-a="salir" data-p="${p.id}" ${dis}>Ya no voy</button>`;
    } else if (abierto(p)) {
      acciones = `<div class="step" title="¿Cuántos van, contándote?"><button data-a="menos" data-p="${p.id}" ${cant <= 1 ? "disabled" : ""}>−</button><span>${cant}</span><button data-a="mas" data-p="${p.id}" ${cant >= f ? "disabled" : ""}>+</button></div>
        <button class="btn" data-a="unirse" data-p="${p.id}" ${dis}>${cant > 1 ? `Nos sumamos (${cant})` : "Me sumo"}</button>
        <span class="mm">${cant > 1 ? `Tú + ${cant - 1} amigo${cant > 2 ? "s" : ""}` : "Solo tú"}</span>`;
    } else acciones = `<div class="warn">${p.estado === "cerrado" ? "El organizador cerró la convocatoria" : "Equipo completo"}</div>`;
  }
  if ((S.modo === "organizar" && esMio) || S.modo === "admin") {
    acciones = `${S.modo === "organizar" ? `<span class="mm">Cupos:</span>
      <div class="step"><button data-a="necMenos" data-p="${p.id}" ${p.necesitan <= Math.max(1, sum) || S.busy ? "disabled" : ""}>−</button><span>${p.necesitan}</span><button data-a="necMas" data-p="${p.id}" ${p.necesitan >= 30 || S.busy ? "disabled" : ""}>+</button></div>` : `<span class="mm" style="flex:1">Organiza ${esc(p.creadorNombre)}</span>`}
      <button class="btn ghost sm" data-a="toggle" data-p="${p.id}" ${dis}>${p.estado === "cerrado" ? "Reabrir" : "Cerrar convocatoria"}</button>
      <button class="btn danger sm" data-a="borrar" data-p="${p.id}" ${dis}>Eliminar</button>`;
    extra = `<div class="plist"><div class="mm" style="font-weight:600;margin-bottom:4px">Jugadores que se sumaron (${sum}/${p.necesitan})</div>
      ${ins.length ? ins.map(i => `<div class="prow">${avatar(i.nombre, i.foto, i.uid, 24)}<span style="flex:1">${esc(i.nombre)}${i.cantidad > 1 ? ` <b>+${i.cantidad - 1}</b>` : ""}</span><button class="btn ghost sm" data-a="quitar" data-i="${esc(i.id)}" ${dis}>Quitar</button></div>`).join("") : `<div class="mm">Todavía nadie. ¡Comparte tu partido!</div>`}</div>`;
  }

  return `<div class="match${esMio && S.modo !== "admin" ? " mine" : ""}">
    <div class="mtop">
      <div class="time"><div class="h">${esc(p.hora)}</div><div class="d">${esc(diaLabel(p.fecha))}</div></div>
      <div style="min-width:0;flex:1">
        <div class="mt">${esc(p.equipo)}</div>
        <div class="mm">${opts.conCancha !== false && c ? `<a href="#" data-a="ver" data-c="${c.id}" style="color:inherit">📍 ${esc(c.nombre)}</a> · ${distKm(c).toFixed(1)} km` : `${avatar(p.creadorNombre, p.creadorFoto, p.creador, 18)} Organiza ${esc(p.creadorNombre)}`}</div>
        ${p.nota ? `<div class="mm" style="margin-top:3px">“${esc(p.nota)}”</div>` : ""}
      </div>
      <div class="faltan">${derecha}</div>
    </div>
    <div class="bar"><div class="a" style="width:${p.somos / total * 100}%"></div><div class="b" style="width:${Math.min(sum, p.necesitan) / total * 100}%"></div></div>
    <div class="stats"><span>Son ${p.somos} · buscan ${p.necesitan}</span><span>${Math.min(sum, p.necesitan)}/${p.necesitan} se sumaron</span></div>
    ${S.modo === "jugar" && ins.length ? `<div class="mm" style="margin-top:6px">Se sumaron: ${ins.map(i => esc(i.uid === uid ? "Tú" : i.nombre.split(" ")[0]) + (i.cantidad > 1 ? ` +${i.cantidad - 1}` : "")).join(", ")}</div>` : ""}
    ${extra}
    ${acciones ? `<div class="actions">${acciones}</div>` : ""}
  </div>`;
}

function detalleCancha() {
  const c = cancha(S.sel); if (!c) { S.sel = null; return vistaActual(); }
  const ps = vigentes().filter(p => p.canchaId === c.id);
  return `<button class="back" data-a="volver">← Volver</button>
    <h2>${esc(c.nombre)}</h2>
    <div class="sub"><span class="tag">${esc(c.tipo)}</span><span>${esc(c.precio)}</span><span>·</span><span>${distKm(c).toFixed(1)} km de ti</span></div>
    <div class="sub" style="margin-top:-4px">📍 ${c.dir ? esc(c.dir) + " · " : ""}<a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank" rel="noopener">Cómo llegar</a>${c.fuente === "osm" ? ` · <span class="mm">Datos: © OpenStreetMap</span>` : ""}</div>
    ${S.modo === "admin" ? `<div class="actions" style="margin:0 0 6px">
      <button class="btn ghost sm" data-a="editarCancha" data-c="${c.id}">✏️ Editar datos</button>
      <button class="btn ghost sm" data-a="moverPin" data-c="${c.id}">📍 Mover pin</button>
      <button class="btn danger sm" data-a="borrarCancha" data-c="${c.id}">Eliminar</button></div>` : ""}
    <div class="sec">Partidos por horario</div>
    ${ps.length ? ps.map(p => tarjeta(p, { conCancha: false })).join("") : `<div class="empty"><div class="big">⚽</div>No hay partidos publicados aquí.</div>`}
    ${S.modo !== "admin" ? `<button class="btn block" style="margin-top:4px" data-a="nuevo" data-c="${c.id}">+ Publicar partido en esta cancha</button>` : ""}`;
}
function listaCanchas() {
  const xs = S.canchas.map(c => ({ c, ...estadoCancha(c) })).sort((a, b) => distKm(a.c) - distKm(b.c));
  if (!xs.length) return `<div class="sec">Canchas</div><div class="empty">Aún no hay canchas registradas.${S.isAdmin ? "<br>Ve a 🛡️ Admin → Canchas." : ""}</div>`;
  return `<div class="sec">Canchas y lozas cercanas</div>` + xs.map(({ c, ps, ab, color }) => `<div class="row click" data-a="ver" data-c="${c.id}">
    <div class="badge" style="background:${color}">${ps.length}</div>
    <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(c.nombre)}</div><div class="mm">${esc(c.tipo)} · ${distKm(c).toFixed(1)} km · ${ab.length ? `${ab.length} buscando jugadores` : ps.length ? "completos" : "sin partidos"}</div></div><span class="mm">›</span></div>`).join("");
}

function vistaJugar() {
  if (S.tab === "mios") {
    if (!S.user) return `<div class="empty"><div class="big">🔒</div>Entra con Google para ver tus partidos.<br><br><button class="gbtn" data-login>Continuar con Google</button></div>`;
    const mis = vigentes().filter(p => miInsc(p.id));
    return `<h2>Mis partidos</h2><div class="sub">Partidos a los que te sumaste.</div>
      ${mis.length ? mis.map(p => tarjeta(p)).join("") : `<div class="empty"><div class="big">🗓️</div>Aún no te has sumado a ningún partido.</div>`}`;
  }
  const todos = vigentes().filter(p => abierto(p) || miInsc(p.id));
  const ab = todos.filter(p => distKm(cancha(p.canchaId)) <= RADIO).sort((a, b) => (a.inicio - b.inicio) || (distKm(cancha(a.canchaId)) - distKm(cancha(b.canchaId))));
  const lejos = todos.filter(p => distKm(cancha(p.canchaId)) > RADIO).sort((a, b) => distKm(cancha(a.canchaId)) - distKm(cancha(b.canchaId))).slice(0, 10);
  return `${bloqueado() ? `<div class="banner">Tu cuenta fue suspendida por el administrador.</div>` : ""}
    ${!S.user ? `<div class="cta"><b>¿Te falta partido?</b><p>Entra con tu cuenta de Google para sumarte o publicar el tuyo.</p><button class="gbtn" data-login>Continuar con Google</button></div>` : ""}
    <h2>Partidos cerca de ti</h2><div class="sub">Equipos que buscan jugadores a menos de ${RADIO} km. Toca un pin del mapa para ver sus horarios.</div>
    ${!S.cargado.partidos ? `<div class="empty">Cargando partidos…</div>` : ab.length ? ab.map(p => tarjeta(p)).join("") : `<div class="empty"><div class="big">🥅</div>Nadie busca jugadores cerca ahora mismo.<br>¿Y si publicas tu partido?</div>`}
    ${S.cargado.partidos && !ab.length && lejos.length ? `<div class="sec">Un poco más lejos</div>${lejos.map(p => tarjeta(p)).join("")}` : ""}
    ${listaCanchas()}`;
}
function vistaOrganizar() {
  if (!S.user) return `<div class="empty"><div class="big">📣</div>Entra con Google para publicar partidos y ver quién se suma.<br><br><button class="gbtn" data-login>Continuar con Google</button></div>`;
  const mios = vigentes().filter(p => p.creador === S.user.uid);
  const totalF = mios.filter(abierto).reduce((a, p) => a + faltan(p), 0);
  return `${bloqueado() ? `<div class="banner">Tu cuenta fue suspendida por el administrador.</div>` : ""}
    <h2>Mis partidos publicados</h2>
    <div class="sub">${mios.length} partido${mios.length === 1 ? "" : "s"}${mios.length ? ` · ${totalF ? `te faltan ${totalF} jugador${totalF === 1 ? "" : "es"}` : "todo completo"}` : ""}</div>
    ${mios.length ? mios.map(p => tarjeta(p)).join("") : `<div class="empty"><div class="big">📣</div>No tienes partidos publicados.</div>`}
    <button class="btn block" data-a="nuevo" ${bloqueado() ? "disabled" : ""}>+ Publicar nuevo partido</button>`;
}
function vistaAdmin() {
  if (!S.isAdmin) return `<div class="empty">Solo para administradores.</div>`;
  if (S.tab === "partidos") {
    const ps = vigentes();
    return `<h2>Todos los partidos</h2><div class="sub">${ps.length} vigentes.</div>${ps.map(p => tarjeta(p)).join("") || `<div class="empty">No hay partidos.</div>`}`;
  }
  if (S.tab === "canchas") {
    const ejemplos = S.canchas.filter(c => c.ejemplo);
    return `<h2>Canchas y lozas</h2>
      ${vistaCandidatos()}
      ${!S.cand ? `<div class="tip"><b>Canchas reales:</b> mueve el mapa a la zona que quieras (por ejemplo tu distrito) y toca <b>Buscar canchas reales</b>. Se buscan en OpenStreetMap las canchas de fútbol y lozas deportivas registradas; tú eliges cuáles importar.</div>
      <button class="btn violet block" style="margin-bottom:8px" data-a="osmBuscar" ${S.candBusy ? "disabled" : ""}>${S.candBusy ? "Buscando…" : "🔎 Buscar canchas reales en la zona visible"}</button>
      <button class="btn ghost block" style="margin-bottom:8px" data-a="addCancha">${S.addMode ? "Haz clic en el mapa…" : "+ Agregar una cancha a mano"}</button>` : ""}
      ${ejemplos.length ? `<button class="btn danger block" style="margin-bottom:8px" data-a="borrarEjemplos" ${S.busy ? "disabled" : ""}>Eliminar las ${ejemplos.length} canchas de ejemplo (y sus partidos)</button>` : ""}
      ${!S.canchas.length && !S.cand ? `<button class="btn ghost block" style="margin-bottom:8px" data-a="seed" ${S.busy ? "disabled" : ""}>Cargar 8 canchas de ejemplo (ficticias)</button>` : ""}
      <div class="sec">Registradas (${S.canchas.length})</div>
      ${S.canchas.slice().sort((a, b) => distKm(a) - distKm(b)).map(c => { const e = estadoCancha(c); return `<div class="row"><div class="badge" style="background:${e.color}">${e.ps.length}</div>
        <div style="flex:1;min-width:0;cursor:pointer" data-a="ver" data-c="${c.id}"><div style="font-weight:600">${esc(c.nombre)}${c.ejemplo ? ' <span class="tag" style="background:#fdeccf;color:#a85a12">ejemplo</span>' : ""}</div><div class="mm">${esc(c.tipo)} · ${distKm(c).toFixed(1)} km${c.fuente === "osm" ? " · OpenStreetMap" : ""}</div></div>
        <button class="btn ghost sm" data-a="editarCancha" data-c="${c.id}" title="Editar">✏️</button>
        <button class="btn danger sm" data-a="borrarCancha" data-c="${c.id}" ${S.busy ? "disabled" : ""}>Eliminar</button></div>`; }).join("")}`;
  }
  if (S.tab === "usuarios") {
    const us = S.usuarios.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    return `<h2>Usuarios</h2><div class="sub">${us.length} registrados. Suspende cuentas que publiquen partidos falsos.</div>
      <table><tr><th>Usuario</th><th>Creó</th><th>Se sumó</th><th></th></tr>
      ${us.map(u => `<tr><td><div style="display:flex;gap:8px;align-items:center">${avatar(u.nombre, u.foto, u.id)}<div><div style="font-weight:600">${esc(u.nombre)}${u.id === S.user.uid ? " (tú)" : ""}</div>${u.bloqueado ? '<div class="mm" style="color:#d64541;font-weight:700">suspendido</div>' : ""}</div></div></td>
        <td>${S.partidos.filter(p => p.creador === u.id).length}</td><td>${S.inscritos.filter(i => i.uid === u.id).length}</td>
        <td>${u.id !== S.user.uid ? `<button class="btn ${u.bloqueado ? "ghost" : "danger"} sm" data-a="bloquear" data-u="${esc(u.id)}" ${S.busy ? "disabled" : ""}>${u.bloqueado ? "Reactivar" : "Suspender"}</button>` : ""}</td></tr>`).join("")}
      </table>`;
  }
  const ps = vigentes();
  const k = [[S.canchas.length, "Canchas registradas"], [ps.length, "Partidos vigentes"], [ps.filter(abierto).reduce((a, p) => a + faltan(p), 0), "Jugadores buscados"], [S.usuarios.length, "Usuarios registrados"]];
  const top = S.canchas.map(c => ({ c, n: estadoCancha(c).ps.length })).sort((a, b) => b.n - a.n), max = Math.max(1, ...top.map(t => t.n));
  return `<h2>Panel de administración</h2><div class="sub">Actividad en tiempo real.</div>
    <div class="kpis">${k.map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")}</div>
    <div class="sec">Partidos por cancha</div>
    ${top.length ? top.map(t => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12.5px"><span style="width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.c.nombre)}</span><div style="flex:1;background:#edf0ea;border-radius:6px;height:10px"><div style="width:${t.n / max * 100}%;background:var(--pitch-2);height:10px;border-radius:6px"></div></div><b style="width:18px;text-align:right">${t.n}</b></div>`).join("") : `<div class="mm">Sin canchas todavía. Ve a la pestaña Canchas.</div>`}`;
}
const vistaActual = () => S.modo === "admin" ? vistaAdmin() : S.modo === "organizar" ? vistaOrganizar() : vistaJugar();
function renderPanel() { $("#panel").innerHTML = S.sel ? detalleCancha() : vistaActual(); }
function renderAll() { renderHeader(); renderTabs(); renderPanel(); dibujarMarkers(); renderStatus(); }

/* =========================================================
   ACCIONES (escrituras en Firestore)
   ========================================================= */
async function conBusy(fn, okMsg) {
  S.busy = true; renderPanel();
  try { await fn(); if (okMsg) toast(typeof okMsg === "function" ? okMsg() : okMsg); }
  catch (e) {
    console.error(e);
    toast(e && e.code === "permission-denied" ? "No tienes permiso para hacer eso." : "No se pudo guardar. Revisa tu conexión.");
  }
  finally { S.busy = false; renderAll(); }
}
let pendiente = null;
function confirmar(clave, msg) {
  if (pendiente === clave) { pendiente = null; return true; }
  pendiente = clave; toast(msg); setTimeout(() => { if (pendiente === clave) pendiente = null; }, 4000); return false;
}
$("#panel").addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
  e.preventDefault();
  const a = b.dataset.a, p = S.partidos.find(x => x.id === b.dataset.p);
  switch (a) {
    case "volver": S.sel = null; if (MAP.popup) MAP.popup.close(); return renderAll();
    case "ver": return seleccionar(b.dataset.c);
    case "nuevo": return abrirPartido(b.dataset.c);
    case "mas": case "menos": {
      const mia = miInsc(p.id), maxC = faltan(p) + (mia ? mia.cantidad : 0);
      const cur = Math.min(Math.max(1, S.cant[p.id] || (mia ? mia.cantidad : 1)), Math.max(1, maxC));
      S.cant[p.id] = a === "mas" ? Math.min(maxC, cur + 1) : Math.max(1, cur - 1);
      return renderPanel();
    }
    case "unirse": {
      if (!pedirLogin()) return;
      const mia = miInsc(p.id), maxC = faltan(p) + (mia ? mia.cantidad : 0);
      const cant = Math.min(Math.max(1, S.cant[p.id] || (mia ? mia.cantidad : 1)), maxC);
      if (cant < 1) return toast("Ya no quedan cupos.");
      const u = S.user;
      return conBusy(() => setDoc(doc(db, "inscritos", `${p.id}_${u.uid}`), { pid: p.id, uid: u.uid, nombre: u.displayName || "Jugador", foto: u.photoURL || "", cantidad: cant, inicio: p.inicio, en: serverTimestamp() })
        .then(() => { delete S.cant[p.id]; }), () => `¡Listo! ${cant > 1 ? `Te sumaste con ${cant - 1} más` : "Te sumaste"}. Faltan ${faltan(p)}.`);
    }
    case "salir": return conBusy(() => deleteDoc(doc(db, "inscritos", `${p.id}_${S.user.uid}`)).then(() => { delete S.cant[p.id]; }), "Saliste del partido. Se liberaron los cupos.");
    case "necMas": return conBusy(() => updateDoc(doc(db, "partidos", p.id), { necesitan: Math.min(30, p.necesitan + 1) }));
    case "necMenos": return conBusy(() => updateDoc(doc(db, "partidos", p.id), { necesitan: Math.max(Math.max(1, sumados(p.id)), p.necesitan - 1) }));
    case "toggle": { const nuevo = p.estado === "cerrado" ? "abierto" : "cerrado";
      return conBusy(() => updateDoc(doc(db, "partidos", p.id), { estado: nuevo }), nuevo === "cerrado" ? "Convocatoria cerrada." : "Convocatoria reabierta."); }
    case "quitar": { const i = S.inscritos.find(x => x.id === b.dataset.i); if (!i) return;
      if (!confirmar("q" + i.id, `Toca "Quitar" otra vez para sacar a ${i.nombre}.`)) return;
      return conBusy(() => deleteDoc(doc(db, "inscritos", i.id)), "Jugador quitado del partido."); }
    case "borrar": {
      if (!confirmar("p" + p.id, "Toca \"Eliminar\" otra vez para confirmar.")) return;
      return conBusy(async () => {
        const batch = writeBatch(db);
        inscritosDe(p.id).forEach(i => batch.delete(doc(db, "inscritos", i.id)));
        batch.delete(doc(db, "partidos", p.id));
        await batch.commit();
      }, "Partido eliminado.");
    }
    case "addCancha": setAddMode(!S.addMode); renderPanel(); if (S.addMode) toast("Busca el lugar o acerca el mapa y haz clic sobre la cancha."); return;
    case "editarCancha": return editarCancha(b.dataset.c);
    case "moverPin": return moverPin(b.dataset.c);
    case "borrarCancha": { const c = cancha(b.dataset.c);
      if (!confirmar("c" + c.id, `Toca otra vez para eliminar "${c.nombre}" y sus partidos.`)) return;
      return conBusy(async () => {
        const batch = writeBatch(db);
        S.partidos.filter(x => x.canchaId === c.id).forEach(x => { inscritosDe(x.id).forEach(i => batch.delete(doc(db, "inscritos", i.id))); batch.delete(doc(db, "partidos", x.id)); });
        batch.delete(doc(db, "canchas", c.id));
        await batch.commit(); S.sel = null;
      }, "Cancha eliminada."); }
    case "bloquear": { const u = S.usuarios.find(x => x.id === b.dataset.u); if (!u) return;
      return conBusy(() => updateDoc(doc(db, "usuarios", u.id), { bloqueado: !u.bloqueado }), u.bloqueado ? `${u.nombre} fue reactivado.` : `${u.nombre} fue suspendido.`); }
    case "seed": return conBusy(sembrarCanchas, "Se cargaron 8 canchas de ejemplo.");
    case "osmBuscar": return buscarOSM();
    case "osmCancelar": S.cand = null; dibujarCandidatos(); return renderPanel();
    case "osmTodos": { const on = !S.cand.every(c => c.sel); S.cand.forEach(c => c.sel = on); return renderPanel(); }
    case "osmImportar": return importarCandidatos();
    case "osmVer": { const c = S.cand.find(x => x.osmId === b.dataset.o); if (c) { panTo(c); if (MAP.kind === "osm") MAP.obj.setZoom(Math.max(MAP.obj.getZoom(), 17)); else MAP.obj.setZoom(Math.max(MAP.obj.getZoom(), 17)); } return; }
    case "borrarEjemplos": {
      const ej = S.canchas.filter(c => c.ejemplo);
      if (!confirmar("ejemplos", `Toca otra vez para eliminar ${ej.length} canchas de ejemplo y sus partidos.`)) return;
      return conBusy(async () => {
        const ops = [];
        ej.forEach(c => {
          S.partidos.filter(x => x.canchaId === c.id).forEach(x => { inscritosDe(x.id).forEach(i => ops.push(doc(db, "inscritos", i.id))); ops.push(doc(db, "partidos", x.id)); });
          ops.push(doc(db, "canchas", c.id));
        });
        for (let i = 0; i < ops.length; i += 400) { const bt = writeBatch(db); ops.slice(i, i + 400).forEach(r => bt.delete(r)); await bt.commit(); }
        S.sel = null;
      }, "Canchas de ejemplo eliminadas.");
    }
  }
});
$("#panel").addEventListener("input", e => {
  const t = e.target, o = t.dataset && t.dataset.o; if (!o || !S.cand) return;
  const c = S.cand.find(x => x.osmId === o); if (!c) return;
  if (t.type === "checkbox") { c.sel = t.checked; const n = S.cand.filter(x => x.sel).length; const b = $("[data-a=osmImportar]"); if (b) { b.textContent = `Importar ${n} cancha${n === 1 ? "" : "s"}`; b.disabled = !n; } }
  else if (t.dataset.f === "nombre") c.nombre = t.value.slice(0, 50);
  else if (t.dataset.f === "tipo") c.tipo = t.value;
});

/* =========================================================
   CANCHAS REALES DESDE OPENSTREETMAP (solo admin)
   ========================================================= */
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
function zonaVisible() {
  if (!MAP.obj) return null;
  let s, w, n, e;
  if (MAP.kind === "google") { const b = MAP.obj.getBounds(); if (!b) return null; s = b.getSouthWest().lat(); w = b.getSouthWest().lng(); n = b.getNorthEast().lat(); e = b.getNorthEast().lng(); }
  else { const b = MAP.obj.getBounds(); s = b.getSouth(); w = b.getWest(); n = b.getNorth(); e = b.getEast(); }
  // limita la búsqueda a ~6 km x 6 km alrededor del centro para no saturar el servicio
  const cLat = (s + n) / 2, cLng = (w + e) / 2, dLat = Math.min((n - s) / 2, 0.028), dLng = Math.min((e - w) / 2, 0.028);
  return { s: cLat - dLat, w: cLng - dLng, n: cLat + dLat, e: cLng + dLng, recortada: (n - s) / 2 > 0.028 || (e - w) / 2 > 0.028 };
}
function tipoDeSuperficie(t) {
  const x = String(t || "").toLowerCase();
  if (/artificial|turf|synthetic/.test(x)) return "Sintética";
  if (/grass/.test(x)) return "Grass natural";
  if (/dirt|ground|sand|earth|gravel|unpaved/.test(x)) return "Tierra";
  return "Loza";
}
async function buscarOSM() {
  const z = zonaVisible(); if (!z) return toast("El mapa aún no carga.");
  S.candBusy = true; renderPanel();
  const bbox = `${z.s.toFixed(5)},${z.w.toFixed(5)},${z.n.toFixed(5)},${z.e.toFixed(5)}`;
  const q = `[out:json][timeout:25];(nwr["leisure"="pitch"]["sport"~"soccer|futsal|football|multi"](${bbox}););out center tags;`;
  let data = null;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (r.ok) { data = await r.json(); break; }
    } catch (e) { console.warn("Overpass", url, e); }
  }
  S.candBusy = false;
  if (!data) { renderPanel(); return toast("OpenStreetMap no respondió. Intenta en unos segundos."); }
  const existentes = S.canchas;
  const vistos = new Set();
  let n = 0;
  S.cand = (data.elements || []).map(el => {
    const lat = el.lat ?? (el.center && el.center.lat), lng = el.lon ?? (el.center && el.center.lon);
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    const t = el.tags || {}, osmId = `${el.type}/${el.id}`;
    const sport = String(t.sport || "");
    const base = /multi/.test(sport) && !/soccer|futsal/.test(sport) ? "Loza multideportiva" : /futsal/.test(sport) ? "Loza de fulbito" : "Cancha de fútbol";
    const calle = t["addr:street"] ? `${t["addr:street"]}${t["addr:housenumber"] ? " " + t["addr:housenumber"] : ""}` : "";
    n++;
    return { osmId, lat, lng, nombre: String(t.name || (calle ? `${base} · ${calle}` : `${base} #${n}`)).slice(0, 50),
      tipo: tipoDeSuperficie(t.surface), dir: calle.slice(0, 80), precio: t.fee === "yes" ? "Pagado" : t.fee === "no" ? "Gratis" : "", sel: true };
  }).filter(c => {
    if (!c || vistos.has(c.osmId)) return false; vistos.add(c.osmId);
    // descarta las que ya están registradas (mismo id de OSM o a menos de 40 m)
    return !existentes.some(x => x.osmId === c.osmId || km(x, c) < 0.04);
  }).sort((a, b) => distKm(a) - distKm(b)).slice(0, 150);
  S.candMsg = z.recortada ? "Se buscó en un área de ~6 km alrededor del centro del mapa. Acerca el mapa a otra zona para buscar ahí." : "";
  dibujarCandidatos(); renderPanel();
  toast(S.cand.length ? `Se encontraron ${S.cand.length} canchas nuevas en esta zona.` : "No se encontraron canchas nuevas en esta zona.");
}
function vistaCandidatos() {
  if (!S.cand) return "";
  const n = S.cand.filter(c => c.sel).length;
  const tipos = ["Loza", "Sintética", "Grass natural", "Tierra"];
  return `<div class="tip" style="background:#f3f0fd"><b>${S.cand.length} canchas encontradas</b> en OpenStreetMap (puntos morados en el mapa). Revisa los nombres y desmarca las que no quieras.${S.candMsg ? `<br><span style="opacity:.8">${esc(S.candMsg)}</span>` : ""}</div>
    ${S.cand.length ? `<div class="actions" style="margin:0 0 8px">
      <button class="btn violet" data-a="osmImportar" ${!n || S.busy ? "disabled" : ""}>Importar ${n} cancha${n === 1 ? "" : "s"}</button>
      <button class="btn ghost sm" data-a="osmTodos">Marcar / desmarcar todas</button>
      <button class="btn ghost sm" data-a="osmCancelar">Cancelar</button></div>
    ${S.cand.map(c => `<div class="row" style="align-items:flex-start">
      <input type="checkbox" data-o="${esc(c.osmId)}" ${c.sel ? "checked" : ""} style="width:18px;height:18px;margin-top:8px;flex:none">
      <div style="flex:1;min-width:0">
        <input data-o="${esc(c.osmId)}" data-f="nombre" value="${esc(c.nombre)}" maxlength="50" style="padding:6px 8px;font-weight:600">
        <div style="display:flex;gap:6px;margin-top:4px;align-items:center">
          <select data-o="${esc(c.osmId)}" data-f="tipo" style="padding:4px 6px;width:auto;font-size:12px">${tipos.map(t => `<option${t === c.tipo ? " selected" : ""}>${t}</option>`).join("")}</select>
          <span class="mm" style="margin:0">${distKm(c).toFixed(1)} km${c.dir ? " · " + esc(c.dir) : ""}</span>
          <a href="#" data-a="osmVer" data-o="${esc(c.osmId)}" class="mm" style="margin:0 0 0 auto">ver</a>
        </div>
      </div></div>`).join("")}
    <div class="mm" style="margin:6px 0 12px">Datos © colaboradores de OpenStreetMap (ODbL).</div>`
    : `<button class="btn ghost block" style="margin-bottom:8px" data-a="osmCancelar">Volver</button>`}`;
}
function dibujarCandidatos() {
  MAP.cand.forEach(quitar); MAP.cand = [];
  if (!MAP.obj || !S.cand) return;
  S.cand.forEach(c => {
    if (MAP.kind === "google") MAP.cand.push(new google.maps.Marker({ map: MAP.obj, position: { lat: c.lat, lng: c.lng }, title: c.nombre, zIndex: 5,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#6d3fd8", fillOpacity: .9, strokeColor: "#fff", strokeWeight: 2 } }));
    else MAP.cand.push(L.circleMarker([c.lat, c.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#6d3fd8", fillOpacity: .9 }).bindTooltip(c.nombre).addTo(MAP.obj));
  });
}
function importarCandidatos() {
  const sel = S.cand.filter(c => c.sel && c.nombre.trim()); if (!sel.length) return;
  conBusy(async () => {
    for (let i = 0; i < sel.length; i += 400) {
      const bt = writeBatch(db);
      sel.slice(i, i + 400).forEach(c => bt.set(doc(collection(db, "canchas")), { nombre: c.nombre.trim().slice(0, 50), tipo: c.tipo, precio: c.precio || "—", dir: c.dir,
        lat: c.lat, lng: c.lng, fuente: "osm", osmId: c.osmId, creadoEn: serverTimestamp() }));
      await bt.commit();
    }
    S.cand = null; dibujarCandidatos();
  }, `Se importaron ${sel.length} canchas reales.`);
}

async function sembrarCanchas() {
  const o = (a, b) => ({ lat: CENTRO.lat + a, lng: CENTRO.lng + b });
  const xs = [
    ["Loza Parque Los Olivos", "Loza", "Gratis", "Parque Los Olivos, cuadra 3", o(0.0060, -0.0080)],
    ["Sintética El Golazo", "Sintética", "S/ 80 la hora", "Av. Los Deportes 1240", o(0.0095, 0.0070)],
    ["Loza Vecinal San Martín", "Loza", "Gratis", "Jr. San Martín 410", o(-0.0070, -0.0120)],
    ["Complejo La Bombonera", "Sintética", "S/ 90 la hora", "Av. Principal 2150", o(-0.0040, 0.0115)],
    ["Loza Parque Central", "Loza", "Gratis", "Parque Central s/n", o(-0.0012, 0.0018)],
    ["Sintética Tiki Taka", "Sintética", "S/ 70 la hora", "Calle Las Gardenias 88", o(0.0130, -0.0150)],
    ["Loza Colegio Santa Rosa", "Loza", "S/ 20 la hora", "Jr. Santa Rosa 560", o(-0.0125, 0.0060)],
    ["Cancha El Potrero", "Tierra", "Gratis", "Psje. El Potrero", o(-0.0110, -0.0030)],
  ];
  const batch = writeBatch(db);
  xs.forEach(([nombre, tipo, precio, dir, ll]) => batch.set(doc(collection(db, "canchas")), { nombre, tipo, precio, dir, ...ll, ejemplo: true, creadoEn: serverTimestamp() }));
  await batch.commit();
}

/* ---------- modales ---------- */
function abrir(id) { $("#" + id).classList.add("on"); }
function cerrar(id) { $("#" + id).classList.remove("on"); }
document.querySelectorAll(".modal-bg").forEach(m => m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-close]")) m.classList.remove("on"); }));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal-bg.on").forEach(m => m.classList.remove("on")); });

function totalHint() { const s = num($("#fpSomos").value, 0, 40, 0), n = num($("#fpNec").value, 0, 40, 0); $("#fpTotal").textContent = `Total en cancha: ${s + n}${s + n === 10 ? " (fútbol 5)" : s + n === 14 ? " (fútbol 7)" : s + n === 22 ? " (fútbol 11)" : ""}.`; }
$("#fpSomos").oninput = $("#fpNec").oninput = totalHint;
function abrirPartido(cid) {
  if (!pedirLogin()) return;
  if (bloqueado()) return toast("Tu cuenta está suspendida.");
  if (!S.canchas.length) return toast("Aún no hay canchas registradas.");
  $("#fpCancha").innerHTML = S.canchas.slice().sort((a, b) => distKm(a) - distKm(b)).map(c => `<option value="${c.id}">${esc(c.nombre)} (${distKm(c).toFixed(1)} km)</option>`).join("");
  if (cid || S.sel) $("#fpCancha").value = cid || S.sel;
  const ult = S.partidos.filter(p => p.creador === S.user.uid).pop();
  $("#fpEquipo").value = ult ? ult.equipo : "";
  $("#fpFecha").value = hoy(); $("#fpFecha").min = hoy();
  totalHint(); abrir("mPartido"); setTimeout(() => $("#fpEquipo").focus(), 50);
}
$("#fPartido").onsubmit = e => {
  e.preventDefault();
  const u = S.user; if (!u) return;
  const fecha = $("#fpFecha").value, hora = $("#fpHora").value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return toast("Revisa fecha y hora.");
  const inicio = inicioMs(fecha, hora);
  if (inicio < Date.now() - 5 * 60 * 1000) return toast("Esa hora ya pasó.");
  const data = { canchaId: $("#fpCancha").value, creador: u.uid, creadorNombre: u.displayName || "Organizador", creadorFoto: u.photoURL || "",
    equipo: $("#fpEquipo").value.trim().slice(0, 40) || "Partido", fecha, hora, inicio,
    somos: num($("#fpSomos").value, 1, 30, 1), necesitan: num($("#fpNec").value, 1, 30, 1),
    nota: $("#fpNota").value.trim().slice(0, 160), estado: "abierto", creadoEn: serverTimestamp() };
  cerrar("mPartido");
  conBusy(async () => {
    await addDoc(collection(db, "partidos"), data);
    $("#fpNota").value = ""; S.modo = "organizar"; S.tab = "publicados"; S.sel = null;
    const c = cancha(data.canchaId); panTo(c);
  }, "¡Partido publicado! Ya aparece en el mapa.");
};
$("#fCancha").onsubmit = e => {
  e.preventDefault();
  if (S.editId) {
    const id = S.editId; S.editId = null;
    const upd = { nombre: $("#fcNombre").value.trim().slice(0, 50), tipo: $("#fcTipo").value, precio: $("#fcPrecio").value.trim().slice(0, 30) || "—", dir: $("#fcDir").value.trim().slice(0, 80) };
    cerrar("mCancha");
    return conBusy(() => updateDoc(doc(db, "canchas", id), upd), "Cancha actualizada.");
  }
  if (!S.newLatLng) return;
  const data = { nombre: $("#fcNombre").value.trim().slice(0, 50), tipo: $("#fcTipo").value, precio: $("#fcPrecio").value.trim().slice(0, 30) || "—",
    dir: $("#fcDir").value.trim().slice(0, 80), lat: S.newLatLng.lat, lng: S.newLatLng.lng, creadoEn: serverTimestamp() };
  cerrar("mCancha"); S.newLatLng = null;
  conBusy(async () => { const r = await addDoc(collection(db, "canchas"), data); S.sel = r.id; }, "Cancha agregada al mapa.");
};

/* ---------- inicio ---------- */
renderAll();
cargarMapa();
usarGPS(true);
// refresca etiquetas "Hoy/Mañana" y oculta partidos pasados cada minuto
setInterval(renderAll, 60000);
