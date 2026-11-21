/**
 * WhyMessenger - Messages & Read Receipts Module
 * Real-time message streaming, Firestore batch read-receipt updates, and message deletion.
 */

import {
  db,
  collection,
  doc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "./firebase.js";
import { updateConversationMetadata } from "./conversations.js";

/**
 * Sends a message in the active conversation and updates parent chat metadata.
 * 
 * @param {string} chatId 
 * @param {string} senderId 
 * @param {string} text Message content
 * @returns {Promise<string>} Created message ID
 */
export async function sendMessage(chatId, senderId, text) {
  if (!text || !text.trim()) {
    throw new Error("Message text cannot be empty.");
  }
  const cleanText = text.trim();
  if (cleanText.length > 2000) {
    throw new Error("Message exceeds the maximum limit of 2,000 characters.");
  }

  const messagesRef = collection(db, "chats", chatId, "messages");
  
  // 1. Add message with readAt initialized to null
  const newDocRef = await addDoc(messagesRef, {
    text: cleanText,
    senderId,
    createdAt: serverTimestamp(),
    readAt: null
  });

  // 2. Update conversation metadata asynchronously
  try {
    await updateConversationMetadata(chatId, {
      lastMessageText: cleanText,
      lastMessageSenderId: senderId
    });
  } catch (err) {
    console.warn("Failed to update conversation metadata:", err);
  }

  return newDocRef.id;
}

/**
 * Subscribes to real-time messages in a conversation.
 * 
 * @param {string} chatId 
 * @param {Function} onMessagesUpdated Callback receiving array of message objects
 * @param {Function} onError Callback for error handling
 * @returns {Function} Unsubscribe function
 */
export function subscribeToMessages(chatId, onMessagesUpdated, onError) {
  if (!chatId) return () => {};

  const messagesRef = collection(db, "chats", chatId, "messages");
  const messagesQuery = query(
    messagesRef,
    orderBy("createdAt", "asc"),
    limit(50)
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = [];
      snapshot.forEach((doc) => {
        messages.push({
          id: doc.id,
          ...doc.data()
        });
      });
      onMessagesUpdated(messages);
    },
    (error) => {
      console.error(`Error in messages subscription for ${chatId}:`, error);
      if (onError) onError(error);
    }
  );
}

/**
 * Marks incoming unread messages as read using a Firestore batch write.
 * Only marks messages where the current user is the recipient (senderId !== currentUid)
 * and readAt is currently null.
 * 
 * @param {string} chatId 
 * @param {string} currentUid 
 * @param {Array<Object>} messages Currently loaded messages
 */
export async function markMessagesAsRead(chatId, currentUid, messages) {
  // Only proceed if browser tab is active/visible
  if (document.visibilityState !== "visible") {
    return;
  }

  const unreadIncoming = (messages || []).filter(
    (msg) => msg.senderId !== currentUid && (msg.readAt === null || msg.readAt === undefined)
  );

  if (unreadIncoming.length === 0) {
    return;
  }

  try {
    const batch = writeBatch(db);
    unreadIncoming.forEach((msg) => {
      const msgRef = doc(db, "chats", chatId, "messages", msg.id);
      batch.update(msgRef, {
        readAt: serverTimestamp()
      });
    });

    await batch.commit();
  } catch (error) {
    console.warn("Error marking messages as read:", error);
  }
}

/**
 * Deletes a message. Enforces that only the sender can delete their message.
 * 
 * @param {string} chatId 
 * @param {string} messageId 
 * @param {string} currentUid 
 * @param {string} senderId 
 */
export async function deleteMessage(chatId, messageId, currentUid, senderId) {
  if (currentUid !== senderId) {
    throw new Error("You can only delete your own messages.");
  }

  const msgRef = doc(db, "chats", chatId, "messages", messageId);
  await deleteDoc(msgRef);
}

/**
 * Filters loaded messages by query string for in-chat search.
 * 
 * @param {Array<Object>} messages 
 * @param {string} searchTerm 
 * @returns {Array<Object>} Matching messages with matching indices
 */
export function searchLoadedMessages(messages = [], searchTerm = "") {
  if (!searchTerm || !searchTerm.trim()) {
    return [];
  }
  const cleanTerm = searchTerm.trim().toLowerCase();
  return messages.filter(
    (msg) => msg.text && msg.text.toLowerCase().includes(cleanTerm)
  );
}
