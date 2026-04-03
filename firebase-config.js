import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJ3uVCe0Myvc6eHAgX9qq8ywTsEqVDy_A",
  authDomain: "pickpose-caa6d.firebaseapp.com",
  projectId: "pickpose-caa6d",
  storageBucket: "pickpose-caa6d.firebasestorage.app",
  messagingSenderId: "76427845849",
  appId: "1:76427845849:web:8ce2da1949f5e10a131ec8",
  measurementId: "G-5C46KZEMJE"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
