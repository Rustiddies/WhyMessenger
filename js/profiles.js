/**
 * WhyMessenger - User Profile Management Module
 * Handles private profiles, public discovery profiles, and memory caching.
 */

import {
  auth,
  db,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  updateProfile,
  runTransaction
} from "./firebase.js";

// In-memory cache for public profiles to prevent repeated Firestore reads
const profileCache = new Map();

/**
 * Generates an SVG Data URI avatar with a chosen emoji and background theme color.
 * @param {string} emoji 
 * @param {string} bgColor Hex color code
 * @returns {string} SVG Data URI
 */
export function generateEmojiAvatar(emoji = "👾", bgColor = "#5865F2") {
  const cleanEmoji = emoji || "👾";
  const cleanColor = bgColor || "#5865F2";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" fill="${cleanColor}" rx="50" />
    <text x="50" y="55" font-family="'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif" font-size="50" text-anchor="middle" dominant-baseline="central">${cleanEmoji}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Updates full profile customization: display name, unique username (with collision handling), and avatar.
 */
export async function updateProfileCustomization(uid, { displayName, username, photoURL }) {
  const trimmedName = (displayName || "").trim();
  const cleanUsername = (username || "").trim().toLowerCase();

  if (!trimmedName) throw new Error("Display name cannot be empty.");
  if (!cleanUsername) throw new Error("Username cannot be empty.");

  const usernameRegex = /^[a-z0-9_]{3,20}$/;
  if (!usernameRegex.test(cleanUsername)) {
    throw new Error("Username must be 3-20 characters and contain only letters, numbers, or underscores.");
  }

  // Get current username
  const currentPublic = await getPublicProfile(uid);
  const oldUsername = currentPublic?.username?.toLowerCase();

  await runTransaction(db, async (transaction) => {
    // If username is changing, claim new username and release old one
    if (oldUsername !== cleanUsername) {
      const newUsernameRef = doc(db, "usernames", cleanUsername);
      const newSnap = await transaction.get(newUsernameRef);
      if (newSnap.exists()) {
        throw new Error(`Username @${cleanUsername} is already taken. Please choose another.`);
      }

      // Claim new username
      transaction.set(newUsernameRef, {
        uid,
        createdAt: serverTimestamp()
      });

      // Delete old username document if it existed
      if (oldUsername) {
        const oldUsernameRef = doc(db, "usernames", oldUsername);
        transaction.delete(oldUsernameRef);
      }
    }

    // Update private profile
    const userRef = doc(db, "users", uid);
    transaction.update(userRef, {
      displayName: trimmedName,
      username: cleanUsername,
      updatedAt: serverTimestamp()
    });

    // Update public discovery profile
    const publicRef = doc(db, "publicProfiles", uid);
    transaction.update(publicRef, {
      displayName: trimmedName,
      displayNameLower: trimmedName.toLowerCase(),
      username: cleanUsername,
      usernameLower: cleanUsername,
      photoURL: photoURL || null,
      updatedAt: serverTimestamp()
    });
  });

  if (auth.currentUser && auth.currentUser.uid === uid) {
    await updateProfile(auth.currentUser, {
      displayName: trimmedName,
      photoURL: photoURL || ""
    });
  }

  profileCache.delete(uid);
}
/**
 * Generates an SVG initials avatar.
 * Uses a deterministic hash of the UID or name to select a Discord-inspired background color.
 * @param {string} displayName 
 * @param {string} uid 
 * @returns {string} SVG Data URI
 */
export function generateInitialsAvatar(displayName = "User", uid = "default") {
  const cleanName = (displayName || "U").trim();
  const parts = cleanName.split(/\s+/);
  let initials = "U";
  if (parts.length >= 2) {
    initials = (parts[0][0] + parts[1][0]).toUpperCase();
  } else if (cleanName.length > 0) {
    initials = cleanName.substring(0, Math.min(2, cleanName.length)).toUpperCase();
  }

  // Discord-style vibrant avatar color palette
  const colors = [
    "#5865F2", // Blurple
    "#57F287", // Green
    "#FEE75C", // Yellow
    "#EB459E", // Fuchsia
    "#ED4245", // Red
    "#00A8FC", // Cyan
    "#9B59B6", // Purple
    "#E67E22"  // Orange
  ];

  let hash = 0;
  const seed = uid + cleanName;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" fill="${color}" rx="50" />
    <text x="50" y="55" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="38" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Fetches the public discovery profile for a user, using memory cache when available.
 * @param {string} uid User ID
 * @param {boolean} forceRefresh Ignore cache
 * @returns {Promise<Object|null>} Public profile object
 */
export async function getPublicProfile(uid, forceRefresh = false) {
  if (!uid) return null;
  if (!forceRefresh && profileCache.has(uid)) {
    return profileCache.get(uid);
  }

  try {
    const docRef = doc(db, "publicProfiles", uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = { uid, ...snap.data() };
      profileCache.set(uid, data);
      return data;
    }
  } catch (error) {
    console.warn(`Error fetching public profile for ${uid}:`, error);
  }
  return null;
}

/**
 * Fetches the full private profile for the currently authenticated user.
 * @param {string} uid User ID
 * @returns {Promise<Object|null>} Private profile object
 */
export async function getPrivateProfile(uid) {
  if (!uid) return null;
  try {
    const docRef = doc(db, "users", uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { uid, ...snap.data() };
    }
  } catch (error) {
    console.error(`Error fetching private profile for ${uid}:`, error);
  }
  return null;
}

/**
 * Updates the user's display name across private profile, public discovery profile, and Auth.
 * @param {string} uid User ID
 * @param {string} newDisplayName New name
 */
export async function updateDisplayName(uid, newDisplayName) {
  if (!newDisplayName || !newDisplayName.trim()) {
    throw new Error("Display name cannot be empty.");
  }
  const trimmed = newDisplayName.trim();

  // 1. Update private profile
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, {
    displayName: trimmed,
    updatedAt: serverTimestamp()
  });

  // 2. Update public discovery profile
  const publicRef = doc(db, "publicProfiles", uid);
  await updateDoc(publicRef, {
    displayName: trimmed,
    displayNameLower: trimmed.toLowerCase(),
    updatedAt: serverTimestamp()
  });

  // 3. Update Firebase Auth user
  if (auth.currentUser && auth.currentUser.uid === uid) {
    await updateProfile(auth.currentUser, { displayName: trimmed });
  }

  // 4. Invalidate cache
  profileCache.delete(uid);
}

/**
 * Updates the user's photoURL across public discovery profile and Auth.
 * @param {string} uid User ID
 * @param {string|null} photoURL Image URL or null if removed
 */
export async function updatePhotoURL(uid, photoURL) {
  const publicRef = doc(db, "publicProfiles", uid);
  await updateDoc(publicRef, {
    photoURL: photoURL || null,
    updatedAt: serverTimestamp()
  });

  if (auth.currentUser && auth.currentUser.uid === uid) {
    await updateProfile(auth.currentUser, { photoURL: photoURL || "" });
  }

  profileCache.delete(uid);
}

/**
 * Preloads and caches multiple public profiles at once.
 * @param {string[]} uids 
 */
export async function preloadPublicProfiles(uids = []) {
  const missing = uids.filter((uid) => uid && !profileCache.has(uid));
  if (missing.length === 0) return;

  await Promise.all(
    missing.map(async (uid) => {
      await getPublicProfile(uid);
    })
  );
}
