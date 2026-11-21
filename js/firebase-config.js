/**
 * WhyMessenger - Firebase Web Configuration
 * 
 * Target Firebase Project:
 *   Project Name: WhyMessenger
 *   Project ID:   whymessenger
 * 
 * INSTRUCTIONS:
 * 1. Open the Firebase Console: https://console.firebase.google.com/
 * 2. Select project "WhyMessenger" (whymessenger).
 * 3. Go to Project Settings (gear icon) -> General -> "Your apps".
 * 4. Under "Firebase SDK snippet", select "Config" or copy the keys below.
 * 5. Replace the placeholder values with your actual project keys.
 * 
 * NOTE: Never commit sensitive private admin service account keys to client web apps.
 * Standard Firebase web client configuration values (apiKey, appId, etc.) are public identifiers.
 */

export const firebaseConfig = {
  apiKey: "AIzaSyA8rBpUsTfCO-rjD1pn533Y8oHYPNGO25Y",
  authDomain: "whymessage-c2d90.firebaseapp.com",
  projectId: "whymessage-c2d90",
  storageBucket: "whymessage-c2d90.firebasestorage.app",
  messagingSenderId: "618478067889",
  appId: "1:618478067889:web:163c5315a8e4de5dcb0290",
  measurementId: "G-VHP21ZYF85"
};


/**
 * Checks whether the configuration contains real values instead of placeholders.
 * @returns {boolean} True if configured with non-placeholder values.
 */
export function isFirebaseConfigured() {
  // Check if saved custom config exists in localStorage (convenience fallback)
  const cached = localStorage.getItem("whymessenger_firebase_config");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.apiKey && !parsed.apiKey.includes("YOUR_API_KEY")) {
        Object.assign(firebaseConfig, parsed);
        return true;
      }
    } catch (e) {
      console.warn("Failed to parse cached firebase config", e);
    }
  }

  return (
    Boolean(firebaseConfig.apiKey) &&
    !firebaseConfig.apiKey.includes("YOUR_API_KEY") &&
    Boolean(firebaseConfig.projectId)
  );
}
