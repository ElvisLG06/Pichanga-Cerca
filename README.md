# Pichanga Cerca — guía de configuración

Web para encontrar partidos de fútbol cerca: login con Google, mapa (Google Maps), partidos en tiempo real.

```
pichanga-cerca/
├── public/
│   ├── index.html      ← la app
│   ├── app.js          ← lógica (Firebase + mapa)
│   ├── styles.css
│   └── config.js       ← ✏️ AQUÍ pegas tus claves
├── firestore.rules     ← reglas de seguridad (✏️ tu correo de admin)
├── firebase.json       ← configuración para Firebase Hosting
└── demo/               ← versiones demo sin Firebase
```

Tiempo estimado: **10–15 minutos**. Todo es gratis para empezar.

---

## 1. Crear el proyecto de Firebase

1. Entra a **https://console.firebase.google.com** con tu Gmail.
2. **Agregar proyecto** → nombre: `pichanga-cerca` → puedes desactivar Google Analytics → **Crear**.

## 2. Registrar la app web y copiar la configuración

1. En la página del proyecto, toca el ícono **`</>`** (Web).
2. Apodo: `pichanga-web` → marca **"Configurar Firebase Hosting"** → **Registrar app**.
3. Te mostrará un bloque `const firebaseConfig = { ... }`. Copia esos valores en **`public/config.js`**, dentro de `firebase: { ... }`:

```js
firebase: {
  apiKey: "AIza...",
  authDomain: "pichanga-cerca.firebaseapp.com",
  projectId: "pichanga-cerca",
  storageBucket: "pichanga-cerca.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123",
},
```

## 3. Activar el login con Google

1. Menú izquierdo → **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso** → **Google** → **Habilitar** → elige tu correo de asistencia → **Guardar**.
3. Pestaña **Configuración → Dominios autorizados**: `localhost` y `tu-proyecto.web.app` ya vienen incluidos. Si luego usas un dominio propio, agrégalo aquí.

## 4. Crear la base de datos (Firestore)

1. Menú → **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: **`southamerica-east1` (São Paulo)**, la más cercana a Perú.
3. Elige **Modo de producción** → **Crear**.
4. Pestaña **Reglas** → borra todo, pega el contenido de **`firestore.rules`** → **Publicar**.
   - Si quieres más administradores, agrega sus correos en `isAdmin()` **y** en `adminEmails` de `config.js`.

## 5. API key de Google Maps (opcional pero recomendado)

Sin esta clave la app funciona igual con OpenStreetMap.

1. Entra a **https://console.cloud.google.com** y arriba elige el proyecto **pichanga-cerca** (Firebase ya lo creó).
2. **APIs y servicios → Biblioteca** → busca **Maps JavaScript API** → **Habilitar**.
   - Google te pedirá vincular una **cuenta de facturación** (tarjeta). Maps tiene un uso mensual gratuito que alcanza de sobra para empezar; puedes poner una alerta de presupuesto en *Facturación → Presupuestos y alertas*.
3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. Toca la clave creada y **restríngela** (importante, para que nadie la use desde otra web):
   - *Restricciones de aplicaciones* → **Sitios web** → agrega:
     - `http://localhost:*/*`
     - `https://pichanga-cerca.web.app/*`
     - `https://pichanga-cerca.firebaseapp.com/*`
   - *Restricciones de API* → **Restringir clave** → marca solo **Maps JavaScript API** → **Guardar**.
5. Pega la clave en `public/config.js` → `googleMapsApiKey: "AIza..."`.

## 6. Probar en tu computadora

El login de Google **no funciona con doble clic** en el archivo; necesita un servidor local. En la carpeta del proyecto:

```bash
# Opción A (si tienes Node.js)
npx serve public
# → abre http://localhost:3000

# Opción B (si tienes Python)
python -m http.server 5000 -d public
# → abre http://localhost:5000
```

**Primera vez:**
1. Entra con **elvislg06@gmail.com** → aparecerá la pestaña **🛡️ Admin**.
2. Admin → **Canchas**: mueve el mapa a tu distrito y toca **🔎 Buscar canchas reales en la zona visible**. La app busca en OpenStreetMap las canchas de fútbol y lozas registradas; revisa los nombres, desmarca las que no quieras e **Importa**. También puedes agregar una a mano con un clic en el mapa.
3. Abre otra ventana en **modo incógnito**, entra con otro Gmail y prueba a publicar o sumarte: los cambios se ven al instante en ambas ventanas.

## 7. Publicarla en internet (GitHub Pages)

La web publicada vive en la rama **`gh-pages`**, que contiene solo lo que hay en `public/`.

**Configuración (una sola vez):**
1. GitHub → **Settings → Pages → Source: "Deploy from a branch"** → Branch **`gh-pages`** / **`/ (root)`** → **Save**.
2. Firebase → **Authentication → Configuración → Dominios autorizados** → agrega `elvislg06.github.io`.

Dirección: **https://elvislg06.github.io/Pichanga-Cerca/**

**Para publicar cambios** hechos en `public/` (rama `main`):
```bash
git subtree split --prefix public -b gh-pages-tmp
git push -f origin gh-pages-tmp:gh-pages
git branch -D gh-pages-tmp
```

### Alternativa: Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase use --add          # elige pichanga-cerca
firebase deploy             # sube la web y las reglas → https://pichanga-cerca.web.app
```

## Instalar como app (PWA)

La web se puede instalar en el celular, con su propio ícono y en pantalla completa:
- **Android (Chrome):** aparece el aviso o el botón **"📲 Instalar app"**. También desde el menú **⋮ → Instalar app**.
- **iPhone (Safari):** **Compartir → "Agregar a inicio"**. La app muestra estas instrucciones la primera vez.

Archivos: `public/manifest.webmanifest`, `public/sw.js` (service worker, red primero), `public/pwa.js` y `public/icons/`.
Si cambias archivos y no ves la versión nueva en la app instalada, ciérrala y vuelve a abrirla.

## Consumo del plan gratuito (Spark)

La app está optimizada para gastar pocas lecturas de Firestore:
- **Caché local persistente:** al volver a abrir la app solo se descargan los cambios, no todo de nuevo.
- **Solo datos vigentes:** se leen únicamente los partidos e inscripciones de las últimas 3 horas en adelante, no el historial.
- Los visitantes sin cuenta no leen inscripciones ni usuarios.

Puedes ver el consumo en Firebase → Firestore → **Uso**.

---

## Qué puede hacer cada tipo de usuario

| | Sin cuenta | Usuario (Gmail) | Admin |
|---|---|---|---|
| Ver mapa, canchas y partidos | ✅ | ✅ | ✅ |
| Sumarse a un partido (con amigos) | — | ✅ | ✅ |
| Publicar partidos, ver quién se sumó, quitar jugadores, ajustar cupos, cerrar o eliminar sus partidos | — | ✅ | ✅ |
| Agregar, importar (OpenStreetMap) o eliminar canchas | — | — | ✅ |
| Eliminar cualquier partido, suspender usuarios | — | — | ✅ |

Las **reglas de Firestore** imponen esto en el servidor: aunque alguien modifique el código en su navegador, no puede borrar partidos ajenos, inscribir a otra persona ni darse permisos de admin.

## Problemas comunes

| Mensaje / síntoma | Solución |
|---|---|
| "Falta configurar Firebase" | Revisa `public/config.js` (paso 2). |
| "Este dominio no está autorizado" | Authentication → Configuración → Dominios autorizados. |
| "Sin permiso para leer datos" | No publicaste las reglas (paso 4). |
| No aparece la pestaña Admin | El correo debe estar en `config.js` **y** en `firestore.rules`, en minúsculas. |
| El mapa sale gris o con "For development purposes only" | Falta habilitar la facturación o la *Maps JavaScript API*, o la restricción de sitios web no incluye tu dirección. |
| Error en consola sobre la clave de Maps | Revisa el paso 5. Mientras tanto la app usa OpenStreetMap. |
