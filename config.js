// ============================================================
//  CONFIGURACIÓN DE PICHANGA CERCA
//  Reemplaza los valores "PEGA_AQUI..." con los de tu proyecto.
//  (Estos datos son públicos por diseño: la seguridad la dan
//   las reglas de Firestore, en firestore.rules)
// ============================================================
window.APP_CONFIG = {
  // Firebase → Configuración del proyecto → Tus apps → App web → firebaseConfig
  firebase: {
    apiKey: "PEGA_AQUI_TU_API_KEY",
    authDomain: "PEGA_AQUI.firebaseapp.com",
    projectId: "PEGA_AQUI",
    storageBucket: "PEGA_AQUI.appspot.com",
    messagingSenderId: "PEGA_AQUI",
    appId: "PEGA_AQUI",
  },

  // Google Cloud → APIs y servicios → Credenciales → Clave de API
  // (con "Maps JavaScript API" habilitada). Si lo dejas vacío se usa OpenStreetMap.
  googleMapsApiKey: "",

  // Correos de Gmail que verán el panel de administrador.
  // IMPORTANTE: pon los mismos correos en firestore.rules (función isAdmin).
  adminEmails: ["elvislg06@gmail.com"],

  // Centro del mapa si el usuario no comparte su ubicación (Miraflores, Lima)
  centro: { lat: -12.1219, lng: -77.0300 },

  // Radio de búsqueda en km
  radioKm: 3,
};
