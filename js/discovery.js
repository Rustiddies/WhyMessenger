/**
 * WhyMessenger - User Discovery Module
 * Implements privacy-respecting, search-first discovery using Cloud Firestore prefix queries.
 */

import {
  db,
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  limit,
  getDocs
} from "./firebase.js";

/**
 * Searches the publicProfiles collection by display name prefix or username prefix.
 * Merges results, deduplicates, and excludes the current user.
 * 
 * @param {string} searchTerm User search query
 * @param {string} currentUid The current user's UID to exclude from results
 * @param {number} maxResults Maximum results to return (default: 10)
 * @returns {Promise<Array<Object>>} Matching public profile objects
 */
export async function searchUsers(searchTerm, currentUid, maxResults = 10) {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return [];
  }

  const cleanTerm = searchTerm.trim().toLowerCase();
  // Firestore Unicode prefix boundary character '\uf8ff'
  const endTerm = cleanTerm + "\uf8ff";

  const publicProfilesRef = collection(db, "publicProfiles");

  // 1. Query by displayNameLower prefix
  const nameQuery = query(
    publicProfilesRef,
    orderBy("displayNameLower"),
    startAt(cleanTerm),
    endAt(endTerm),
    limit(maxResults)
  );

  // 2. Query by usernameLower prefix
  const usernameQuery = query(
    publicProfilesRef,
    orderBy("usernameLower"),
    startAt(cleanTerm),
    endAt(endTerm),
    limit(maxResults)
  );

  try {
    const [nameSnap, usernameSnap] = await Promise.all([
      getDocs(nameQuery),
      getDocs(usernameQuery)
    ]);

    const resultsMap = new Map();

    nameSnap.forEach((doc) => {
      const data = { uid: doc.id, ...doc.data() };
      if (data.uid !== currentUid) {
        resultsMap.set(data.uid, data);
      }
    });

    usernameSnap.forEach((doc) => {
      const data = { uid: doc.id, ...doc.data() };
      if (data.uid !== currentUid && !resultsMap.has(data.uid)) {
        resultsMap.set(data.uid, data);
      }
    });

    return Array.from(resultsMap.values()).slice(0, maxResults);
  } catch (error) {
    console.error("Error executing user search queries:", error);
    throw error;
  }
}

/**
 * Creates a debounced function that delays execution until after wait milliseconds.
 * @param {Function} func Function to debounce
 * @param {number} wait Milliseconds to wait
 * @returns {Function}
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
