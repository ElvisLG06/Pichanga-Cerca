// ============================================================
//  CONFIGURACIÓN DE PICHANGA CERCA
//  Reemplaza los valores "PEGA_AQUI..." con los de tu proyecto.
//  (Estos datos son públicos por diseño: la seguridad la dan
//   las reglas de Firestore, en firestore.rules)
// ============================================================
window.APP_CONFIG = {
  // Firebase → Configuración del proyecto → Tus apps → App web → firebaseConfig
  firebase: {
    apiKey: "AIzaSyA58Xx4Rfdg7OOBM9QIKaay1Y2_7IVilg4",
    authDomain: "pichanga-cerca.firebaseapp.com",
    projectId: "pichanga-cerca",
    storageBucket: "pichanga-cerca.firebasestorage.app",
    messagingSenderId: "21327229248",
    appId: "1:21327229248:web:878ce640edbda673b7caa5",
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
