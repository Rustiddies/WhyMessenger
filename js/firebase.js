/**
 * WhyMessenger - Firebase Modular SDK Initializer
 * Version: 10.12.2 (Consistent across all imports)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAt,
  endAt,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

let app = null;
let auth = null;
let db = null;
let storage = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

  // Set persistent authentication across browser refreshes
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("Auth persistence warning:", err);
  });
} catch (error) {
  console.warn("Firebase initialization waiting for valid configuration:", error.message);
}

export {
  app,
  auth,
  db,
  storage,
  // Auth primitives
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  // Firestore primitives
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAt,
  endAt,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  writeBatch,
  // Storage primitives
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
};
