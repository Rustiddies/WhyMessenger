/**
 * WhyMessenger - Authentication Module
 * Handles Registration, Login, Logout, Password Reset, and Unique Username enforcement.
 */

import {
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail as fbSendReset,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  runTransaction
} from "./firebase.js";

/**
 * Validates registration input data.
 * @param {Object} data 
 * @returns {string|null} Error message or null if valid.
 */
export function validateRegistrationData({ displayName, username, email, password, confirmPassword }) {
  if (!displayName || !displayName.trim()) {
    return "Full name is required.";
  }
  if (!username || !username.trim()) {
    return "Username is required.";
  }
  const cleanUsername = username.trim().toLowerCase();
  const usernameRegex = /^[a-z0-9_]{3,20}$/;
  if (!usernameRegex.test(cleanUsername)) {
    return "Username must be 3-20 characters and contain only letters, numbers, or underscores.";
  }
  if (!email || !email.trim()) {
    return "Email address is required.";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return "Please enter a valid email address.";
  }
  if (!password || password.length < 6) {
    return "Password must be at least 6 characters.";
  }
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}

/**
 * Registers a new user with email, password, display name, and unique username.
 * Atomically reserves the username in Cloud Firestore.
 */
export async function registerUser({ displayName, username, email, password }) {
  const cleanUsername = username.trim().toLowerCase();
  const trimmedName = displayName.trim();
  const trimmedEmail = email.trim();

  // 1. Create the Firebase Auth account first so the user is authenticated for Firestore operations
  const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
  const user = userCredential.user;

  try {
    // 2. Atomically check and claim username and create private and public profile documents
    const usernameDocRef = doc(db, "usernames", cleanUsername);
    await runTransaction(db, async (transaction) => {
      const uSnap = await transaction.get(usernameDocRef);
      if (uSnap.exists()) {
        throw new Error("This username is already taken. Please choose another.");
      }

      // Reserve username
      transaction.set(usernameDocRef, {
        uid: user.uid,
        createdAt: serverTimestamp()
      });

      // Private profile (users/{uid}) - Contains private email
      const userRef = doc(db, "users", user.uid);
      transaction.set(userRef, {
        uid: user.uid,
        email: trimmedEmail,
        displayName: trimmedName,
        username: cleanUsername,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Public profile (publicProfiles/{uid}) - No private email
      const publicRef = doc(db, "publicProfiles", user.uid);
      transaction.set(publicRef, {
        uid: user.uid,
        displayName: trimmedName,
        displayNameLower: trimmedName.toLowerCase(),
        username: cleanUsername,
        usernameLower: cleanUsername,
        photoURL: null,
        updatedAt: serverTimestamp()
      });
    });

    // 3. Update the Auth profile's displayName
    await updateProfile(user, { displayName: trimmedName });

    return user;
  } catch (txError) {
    // If database transaction failed, delete auth user to prevent orphaned account
    try {
      await user.delete();
    } catch (delErr) {
      console.warn("Could not delete orphaned auth user:", delErr);
    }
    throw txError;
  }
}

/**
 * Authenticates user with email and password.
 * Also provides backward-compatible publicProfile creation for existing legacy accounts.
 */
export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const user = userCredential.user;

  // Backward compatibility check for public profile
  try {
    const publicRef = doc(db, "publicProfiles", user.uid);
    const publicSnap = await getDoc(publicRef);

    if (!publicSnap.exists()) {
      // Fetch private profile if it exists or fallback to auth info
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;

      const fallbackName = userData?.displayName || user.displayName || user.email.split("@")[0];
      const fallbackUsername = (userData?.username || user.email.split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase()) || "user";

      await setDoc(publicRef, {
        uid: user.uid,
        displayName: fallbackName,
        displayNameLower: fallbackName.toLowerCase(),
        username: fallbackUsername,
        usernameLower: fallbackUsername.toLowerCase(),
        photoURL: user.photoURL || null,
        updatedAt: serverTimestamp()
      });

      // If username document doesn't exist, claim it
      const uRef = doc(db, "usernames", fallbackUsername.toLowerCase());
      const uSnap = await getDoc(uRef);
      if (!uSnap.exists()) {
        await setDoc(uRef, { uid: user.uid, createdAt: serverTimestamp() });
      }
    }
  } catch (err) {
    console.warn("Public profile backward-compatibility check warning:", err);
  }

  return user;
}

/**
 * Authenticates user via Google Sign-In popup.
 * Automatically claims a unique handle and creates profile documents for new users.
 */
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  try {
    const publicRef = doc(db, "publicProfiles", user.uid);
    const publicSnap = await getDoc(publicRef);

    if (!publicSnap.exists()) {
      // Derive a clean, valid alphanumeric base handle
      let baseHandle = (user.email ? user.email.split("@")[0] : (user.displayName || "user"))
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 15);
      if (!baseHandle || baseHandle.length < 3) baseHandle = "user";

      let chosenUsername = baseHandle;
      let counter = 1;
      let isUnique = false;

      // Find an available unique handle
      while (!isUnique && counter <= 10) {
        const uRef = doc(db, "usernames", chosenUsername);
        const uSnap = await getDoc(uRef);
        if (!uSnap.exists()) {
          isUnique = true;
        } else {
          const suffix = Math.floor(100 + Math.random() * 900);
          chosenUsername = `${baseHandle.slice(0, 12)}_${suffix}`;
          counter++;
        }
      }

      if (!isUnique) {
        chosenUsername = `user_${Date.now().toString().slice(-6)}`;
      }

      const trimmedName = user.displayName || chosenUsername;

      // Atomically claim username and create private and public profiles
      await runTransaction(db, async (transaction) => {
        const usernameDocRef = doc(db, "usernames", chosenUsername);
        transaction.set(usernameDocRef, {
          uid: user.uid,
          createdAt: serverTimestamp()
        });

        const userRef = doc(db, "users", user.uid);
        transaction.set(userRef, {
          uid: user.uid,
          email: user.email || "",
          displayName: trimmedName,
          username: chosenUsername,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        transaction.set(publicRef, {
          uid: user.uid,
          displayName: trimmedName,
          displayNameLower: trimmedName.toLowerCase(),
          username: chosenUsername,
          usernameLower: chosenUsername,
          photoURL: user.photoURL || null,
          updatedAt: serverTimestamp()
        });
      });
    }
  } catch (err) {
    console.warn("Google Sign-In profile provisioning notice:", err);
  }

  return user;
}

/**
 * Sends a password reset email to the specified address.
 */
export async function resetPassword(email) {
  if (!email || !email.trim()) {
    throw new Error("Please enter your registered email address.");
  }
  await fbSendReset(auth, email.trim());
}

/**
 * Signs out the currently authenticated user.
 */
export async function logoutUser() {
  await fbSignOut(auth);
}

/**
 * Listens for auth state changes.
 * @param {Function} callback Callback with current user object (or null)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Translates Firebase Auth error codes into friendly user messages.
 */
export function formatAuthError(error) {
  if (!error) return "An unknown error occurred.";
  const code = error.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "The email address is invalid.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password. Please verify your credentials.";
    case "auth/email-already-in-use":
      return "An account with this email address already exists.";
    case "auth/weak-password":
      return "The password is too weak. Please use at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later or reset your password.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before completing.";
    case "auth/cancelled-popup-request":
      return "Google sign-in popup was cancelled.";
    case "auth/popup-blocked":
      return "Google sign-in popup was blocked by your browser. Please allow popups.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using a different sign-in method.";
    case "auth/unauthorized-domain":
      const host = window.location.hostname || "your domain";
      return `Domain '${host}' is not authorized in Firebase. Add '${host}' to Firebase Console > Authentication > Settings > Authorized domains.`;
    default:
      return error.message || "An authentication error occurred.";
  }
}
