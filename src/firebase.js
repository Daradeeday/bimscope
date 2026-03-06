import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

// ⚠️  Replace with your own Firebase project config
// Go to https://console.firebase.google.com → Project Settings → Web App
const firebaseConfig = {
   apiKey: "AIzaSyClrq22SErrlv0a3oDJz_9E3lzhgaURD9U",
  authDomain: "bimpunya.firebaseapp.com",
  projectId: "bimpunya",
  storageBucket: "bimpunya.firebasestorage.app",
  messagingSenderId: "1011157414971",
  appId: "1:1011157414971:web:2fc20a772ffce4193bd81e",
  measurementId: "G-J3BKHNHEP4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
};
