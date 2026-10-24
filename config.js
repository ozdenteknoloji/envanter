// Firebase ayarları (envanter-merkezi projesi). Bu değerler gizli değildir; erişimi firestore.rules korur.
// Firebase → Proje ayarları → Web uygulaması → firebaseConfig bloğunu buraya yapıştırın.
export const firebaseConfig = {
  apiKey: "AIzaSyC9q2_CG7VTrsbSDOgv_z0LW8TWCmFtBcE",
  authDomain: "envanter-merkezi.firebaseapp.com",
  projectId: "envanter-merkezi",
  storageBucket: "envanter-merkezi.firebasestorage.app",
  messagingSenderId: "609626535989",
  appId: "1:609626535989:web:0b71cba8b43de93fd3597c",
};

// Kullanıcı adları bu alan adıyla giriş e-postasına çevrilir (serik → serik@envanter-merkezi.app).
export const GIRIS_ALANI = "envanter-merkezi.app";

// Anlık bildirim (Web Push) anahtarı: Firebase → Proje ayarları → Cloud Messaging → Web Push sertifikaları → Anahtar çifti (genel anahtar).
export const VAPID_KEY = "BAowF18GJId99CR2jevjDMYlHgs7esWqa6V9uZrTZl73D6JoyRoUEzPUSp7E_fhAOgcg0sL95noY0BWJc8TGJSY";
