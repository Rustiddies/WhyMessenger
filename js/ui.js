/**
 * WhyMessenger - UI Controller Module
 * Handles Discord-inspired rendering, modal management, toasts, and DOM interactions.
 */

import { generateInitialsAvatar } from "./profiles.js";

/**
 * Escapes raw strings for safe HTML injection (XSS defense).
 * @param {string} str 
 * @returns {string} Sanitized string
 */
export function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formats a Firestore timestamp into Discord-style relative time.
 * E.g., "Today at 2:45 PM", "Yesterday at 11:30 AM", or "Nov 15, 2026"
 * @param {Object|Date} timestamp 
 * @returns {string} Formatted timestamp string
 */
export function formatMessageTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const timeString = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (isToday) {
    return `Today at ${timeString}`;
  } else if (isYesterday) {
    return `Yesterday at ${timeString}`;
  } else {
    return `${date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} at ${timeString}`;
  }
}

/**
 * Formats a date for the in-chat day separator bar.
 * @param {Object|Date} timestamp 
 * @returns {string}
 */
export function formatDateSeparator(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/**
 * Shows a toast notification message.
 * @param {string} message 
 * @param {'info'|'success'|'error'|'warning'} type 
 * @param {number} duration Duration in ms
 */
export function showToast(message, type = "info", duration = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `wm-toast wm-toast-${type}`;

  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
  } else if (type === "error") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
  } else {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`;
  }

  toast.innerHTML = `
    ${iconSvg}
    <div class="toast-content">${escapeHTML(message)}</div>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  const removeToast = () => {
    toast.classList.add("toast-hiding");
    toast.addEventListener("animationend", () => toast.remove());
  };

  toast.querySelector(".toast-close").addEventListener("click", removeToast);
  container.appendChild(toast);

  setTimeout(removeToast, duration);
}

/**
 * Displays a styled confirmation modal dialog.
 */
export function showConfirmModal({ title, message, confirmText = "Confirm", cancelText = "Cancel", onConfirm }) {
  const modal = document.getElementById("confirm-modal");
  if (!modal) return;

  document.getElementById("confirm-modal-title").textContent = title;
  document.getElementById("confirm-modal-message").textContent = message;
  const confirmBtn = document.getElementById("confirm-modal-action-btn");
  const cancelBtn = document.getElementById("confirm-modal-cancel-btn");

  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;

  // Clone button to remove previous listeners
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    if (onConfirm) onConfirm();
  });

  cancelBtn.onclick = () => modal.classList.add("hidden");
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  };

  modal.classList.remove("hidden");
}

/**
 * Renders the list of recent conversations in the sidebar.
 */
export function renderConversationsList({
  conversations,
  currentChatId,
  cachedProfiles,
  onSelectChat
}) {
  const listEl = document.getElementById("conversations-list");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!conversations || conversations.length === 0) {
    listEl.innerHTML = `
      <div class="empty-conversations-state">
        <div class="empty-icon">💬</div>
        <p class="empty-title">No conversations yet</p>
        <p class="empty-subtitle">Search for someone above to start chatting.</p>
      </div>
    `;
    return;
  }

  conversations.forEach((conv) => {
    const profile = cachedProfiles.get(conv.otherUid) || {
      displayName: "Loading...",
      username: "user",
      photoURL: null
    };

    const isSelected = conv.id === currentChatId;
    const avatarSrc = profile.photoURL || generateInitialsAvatar(profile.displayName, conv.otherUid);
    const timeFormatted = conv.lastMessageAt ? formatMessageTime(conv.lastMessageAt) : "";
    const preview = conv.lastMessageText ? escapeHTML(conv.lastMessageText) : "Conversation started";

    const item = document.createElement("div");
    item.className = `conversation-item ${isSelected ? "active" : ""}`;
    item.dataset.chatId = conv.id;
    item.dataset.otherUid = conv.otherUid;

    item.innerHTML = `
      <div class="avatar-wrapper">
        <img class="avatar" src="${avatarSrc}" alt="${escapeHTML(profile.displayName)}" />
      </div>
      <div class="conversation-details">
        <div class="conv-top-row">
          <span class="conv-name">${escapeHTML(profile.displayName)}</span>
          <span class="conv-timestamp">${timeFormatted}</span>
        </div>
        <div class="conv-preview">${preview}</div>
      </div>
    `;

    item.addEventListener("click", () => {
      onSelectChat(conv.id, conv.otherUid);
    });

    listEl.appendChild(item);
  });
}

/**
 * Renders user discovery search results.
 */
export function renderSearchResults({
  results,
  isLoading,
  searchTerm,
  onStartChat
}) {
  const container = document.getElementById("search-results-container");
  if (!container) return;

  container.innerHTML = "";

  if (isLoading) {
    container.innerHTML = `
      <div class="search-feedback-state">
        <div class="wm-spinner"></div>
        <p>Searching directory...</p>
      </div>
    `;
    return;
  }

  if (!searchTerm || searchTerm.trim().length < 2) {
    container.innerHTML = `
      <div class="search-feedback-state">
        <p>Type at least 2 characters to search by name or username.</p>
      </div>
    `;
    return;
  }

  if (results.length === 0) {
    container.innerHTML = `
      <div class="search-feedback-state">
        <div class="empty-icon">🔍</div>
        <p class="empty-title">No users found</p>
        <p class="empty-subtitle">We couldn't find anyone matching "${escapeHTML(searchTerm)}".</p>
      </div>
    `;
    return;
  }

  results.forEach((user) => {
    const avatarSrc = user.photoURL || generateInitialsAvatar(user.displayName, user.uid);
    const card = document.createElement("div");
    card.className = "search-result-card";

    card.innerHTML = `
      <div class="avatar-wrapper">
        <img class="avatar" src="${avatarSrc}" alt="${escapeHTML(user.displayName)}" />
      </div>
      <div class="user-meta">
        <div class="user-display-name">${escapeHTML(user.displayName)}</div>
        <div class="user-handle">@${escapeHTML(user.username)}</div>
      </div>
      <button class="btn btn-sm btn-primary action-btn">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
          <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
        </svg>
        Message
      </button>
    `;

    card.querySelector(".action-btn").addEventListener("click", () => {
      onStartChat(user.uid);
    });

    container.appendChild(card);
  });
}

/**
 * Renders the main chat header and message list.
 */
export function renderActiveChatMessages({
  messages,
  currentUid,
  otherProfile,
  onDeleteMessage
}) {
  const container = document.getElementById("messages-stream");
  if (!container) return;

  container.innerHTML = "";

  if (messages.length === 0) {
    const avatarSrc = otherProfile.photoURL || generateInitialsAvatar(otherProfile.displayName, otherProfile.uid);
    container.innerHTML = `
      <div class="chat-beginning-state">
        <img class="large-avatar" src="${avatarSrc}" alt="${escapeHTML(otherProfile.displayName)}" />
        <h2>${escapeHTML(otherProfile.displayName)}</h2>
        <p class="user-tag">@${escapeHTML(otherProfile.username)}</p>
        <p class="beginning-desc">This is the start of your direct message history with <strong>${escapeHTML(otherProfile.displayName)}</strong>.</p>
      </div>
    `;
    return;
  }

  let lastDateKey = null;

  messages.forEach((msg) => {
    // Insert date separator if day changed
    if (msg.createdAt) {
      const dateKey = formatDateSeparator(msg.createdAt);
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        const separator = document.createElement("div");
        separator.className = "date-separator";
        separator.innerHTML = `<span>${dateKey}</span>`;
        container.appendChild(separator);
      }
    }

    const isOwn = msg.senderId === currentUid;
    const msgEl = document.createElement("div");
    msgEl.className = `message-row ${isOwn ? "message-sent" : "message-received"}`;
    msgEl.dataset.messageId = msg.id;

    // Read receipt status for sent messages
    let statusHTML = "";
    if (isOwn) {
      if (msg.readAt) {
        statusHTML = `<span class="receipt-status seen" title="Seen ${formatMessageTime(msg.readAt)}">Seen ✓✓</span>`;
      } else {
        statusHTML = `<span class="receipt-status sent" title="Sent to recipient">Sent ✓</span>`;
      }
    }

    const timeStr = formatMessageTime(msg.createdAt);
    const deleteButtonHTML = isOwn
      ? `<button class="btn-icon delete-msg-btn" title="Delete message" aria-label="Delete message">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
         </button>`
      : "";

    msgEl.innerHTML = `
      <div class="message-bubble-wrapper">
        <div class="message-bubble">
          <div class="message-text">${escapeHTML(msg.text)}</div>
          <div class="message-meta">
            <span class="message-time">${timeStr}</span>
            ${statusHTML}
          </div>
        </div>
        ${deleteButtonHTML}
      </div>
    `;

    if (isOwn) {
      const delBtn = msgEl.querySelector(".delete-msg-btn");
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          onDeleteMessage(msg.id);
        });
      }
    }

    container.appendChild(msgEl);
  });
}
