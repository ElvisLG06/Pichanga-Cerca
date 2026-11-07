// Instalación como app (PWA): service worker, botón "Instalar" en Android y
// aviso con instrucciones en iPhone. Script independiente de app.js.
(function () {
  const $ = s => document.querySelector(s);
  const KEY = "pichanga-install-cerrado";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const movil = ios || /android/i.test(ua);
  const store = { get: () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
                  set: v => { try { localStorage.setItem(KEY, v); } catch (_) {} } };

  // Service worker (necesario para que Android ofrezca "Instalar")
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e)));
  }
  if (standalone) return; // ya está instalada

  const bar = $("#installBar"), txt = $("#installText"), btn = $("#installBtn"), head = $("#installHeader");
  const cerrado = () => { const t = Number(store.get()); return t && Date.now() - t < 7 * 864e5; }; // no insistir por 7 días
  function mostrar(html, conBoton) { txt.innerHTML = html; btn.style.display = conBoton ? "" : "none"; bar.classList.add("on"); }
  function ocultar(recordar) { bar.classList.remove("on"); if (recordar) store.set(String(Date.now())); }
  $("#installClose").onclick = () => ocultar(true);

  // Android / Chrome / Edge: el navegador avisa que se puede instalar
  let evento = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); evento = e;
    head.classList.add("on");
    if (movil && !cerrado()) setTimeout(() => mostrar("<b>Instala Pichanga Cerca</b>Ábrela como app, desde tu pantalla de inicio.", true), 2500);
  });
  async function instalar() {
    if (!evento) return;
    evento.prompt();
    const r = await evento.userChoice.catch(() => null);
    evento = null; head.classList.remove("on"); ocultar(!(r && r.outcome === "accepted"));
  }
  btn.onclick = instalar; head.onclick = instalar;
  window.addEventListener("appinstalled", () => { head.classList.remove("on"); ocultar(false); });

  // iPhone / iPad: Apple no muestra aviso, así que explicamos los pasos
  if (ios && !cerrado()) {
    const share = `<svg class="ios-share" width="16" height="18" viewBox="0 0 16 20" fill="none" stroke="#2f7bf6" stroke-width="1.8"><path d="M8 13V1M4 5l4-4 4 4M3 8H1.5v10.5h13V8H13"/></svg>`;
    const safari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    setTimeout(() => mostrar(`<b>Instala Pichanga Cerca</b>Toca ${share} <b style="display:inline">Compartir</b> ${safari ? "abajo" : "en el menú"} y luego <b style="display:inline">"Agregar a inicio"</b>.`, false), 2500);
  }
})();
