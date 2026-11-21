/**
 * WhyMessenger - Conversations Module
 * Handles deterministic 1-to-1 conversation IDs, recent chats subscriptions, and metadata updates.
 */

import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "./firebase.js";

/**
 * Computes deterministic conversation ID by sorting the two participant UIDs alphabetically.
 * E.g., ['userB', 'userA'] -> 'userA_userB'
 * @param {string} uidA 
 * @param {string} uidB 
 * @returns {string} Deterministic Chat ID
 */
export function getChatId(uidA, uidB) {
  if (!uidA || !uidB) {
    throw new Error("Both participant UIDs are required to compute a Chat ID.");
  }
  return [uidA, uidB].sort().join("_");
}

/**
 * Fetches an existing conversation or creates a new one idempotently.
 * This function should only be invoked upon deliberate user action ("Start Conversation").
 * 
 * @param {string} currentUid 
 * @param {string} otherUid 
 * @returns {Promise<Object>} Conversation metadata object { id, participants, ... }
 */
export async function getOrCreateConversation(currentUid, otherUid) {
  if (currentUid === otherUid) {
    throw new Error("Cannot create a conversation with yourself.");
  }

  const chatId = getChatId(currentUid, otherUid);
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);

  if (chatSnap.exists()) {
    return { id: chatId, ...chatSnap.data() };
  }

  const sortedParticipants = [currentUid, otherUid].sort();
  const newChatData = {
    participants: sortedParticipants,
    createdAt: serverTimestamp(),
    lastMessageText: "",
    lastMessageAt: null,
    lastMessageSenderId: null,
    updatedAt: serverTimestamp()
  };

  await setDoc(chatRef, newChatData);
  return { id: chatId, ...newChatData };
}

/**
 * Subscribes to real-time updates for recent conversations where the user is a participant.
 * Orders by updatedAt descending.
 * 
 * @param {string} currentUid 
 * @param {Function} onConversationsUpdated Callback receiving array of conversations
 * @param {Function} onError Callback receiving error object
 * @returns {Function} Unsubscribe function
 */
export function subscribeToRecentConversations(currentUid, onConversationsUpdated, onError) {
  if (!currentUid) {
    return () => {};
  }

  const chatsRef = collection(db, "chats");
  const chatsQuery = query(
    chatsRef,
    where("participants", "array-contains", currentUid),
    orderBy("updatedAt", "desc"),
    limit(50)
  );

  return onSnapshot(
    chatsQuery,
    (snapshot) => {
      const conversations = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Only show conversations that have had messages sent or were explicitly created
        conversations.push({
          id: doc.id,
          ...data,
          // Extract the other participant UID
          otherUid: (data.participants || []).find((uid) => uid !== currentUid)
        });
      });
      onConversationsUpdated(conversations);
    },
    (error) => {
      console.error("Error in recent conversations snapshot listener:", error);
      if (onError) onError(error);
    }
  );
}

/**
 * Updates conversation metadata when a new message is sent.
 * @param {string} chatId 
 * @param {Object} metadata 
 */
export async function updateConversationMetadata(chatId, { lastMessageText, lastMessageSenderId }) {
  const chatRef = doc(db, "chats", chatId);
  const truncatedText = lastMessageText.length > 70 
    ? lastMessageText.substring(0, 67) + "..." 
    : lastMessageText;

  await updateDoc(chatRef, {
    lastMessageText: truncatedText,
    lastMessageSenderId,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
