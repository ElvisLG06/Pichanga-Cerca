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
├── firebase.json       ← configuración para publicar
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
2. Admin → **Canchas** → **Cargar 8 canchas de ejemplo**, o agrega canchas reales con **+ Agregar cancha** y clic en el mapa.
3. Abre otra ventana en **modo incógnito**, entra con otro Gmail y prueba a publicar o sumarte: los cambios se ven al instante en ambas ventanas.

> La app pide tu ubicación al abrir. Si estás lejos de Miraflores, las canchas de ejemplo aparecerán en "Un poco más lejos". Lo ideal es agregar las canchas reales de tu zona desde el panel de admin.

## 7. Publicarla en internet (para abrirla desde el celular)

Necesitas Node.js (https://nodejs.org). En la carpeta del proyecto:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # elige pichanga-cerca, alias: default
firebase deploy             # sube la web y las reglas
```

Te dará la dirección: **https://pichanga-cerca.web.app**. Cada vez que cambies algo, vuelve a ejecutar `firebase deploy`.

---

## Qué puede hacer cada tipo de usuario

| | Sin cuenta | Usuario (Gmail) | Admin |
|---|---|---|---|
| Ver mapa, canchas y partidos | ✅ | ✅ | ✅ |
| Sumarse a un partido (con amigos) | — | ✅ | ✅ |
| Publicar partidos, ver quién se sumó, quitar jugadores, ajustar cupos, cerrar o eliminar sus partidos | — | ✅ | ✅ |
| Agregar o eliminar canchas | — | — | ✅ |
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
