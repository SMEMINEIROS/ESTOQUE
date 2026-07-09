import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAQjgm3FRSAX93XdgTSWtkk7qW2DGkhybQ",
  authDomain: "estoque-uniformes.firebaseapp.com",
  projectId: "estoque-uniformes",
  storageBucket: "estoque-uniformes.firebasestorage.app",
  messagingSenderId: "1023222277443",
  appId: "1:1023222277443:web:c96d4b40481253c8623bf6"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
