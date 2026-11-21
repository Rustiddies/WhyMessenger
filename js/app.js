/**
 * WhyMessenger - Main Application Controller
 * Coordinates state, Firebase subscriptions, event listeners, and UI views.
 */

import { isFirebaseConfigured, firebaseConfig } from "./firebase-config.js";
import {
  subscribeToAuthState,
  registerUser,
  loginUser,
  loginWithGoogle,
  logoutUser,
  resetPassword,
  validateRegistrationData,
  formatAuthError
} from "./auth.js";
import {
  getPublicProfile,
  getPrivateProfile,
  updateDisplayName,
  updatePhotoURL,
  generateInitialsAvatar,
  generateEmojiAvatar,
  preloadPublicProfiles,
  updateProfileCustomization
} from "./profiles.js";
import { searchUsers, debounce } from "./discovery.js";
import {
  getOrCreateConversation,
  subscribeToRecentConversations
} from "./conversations.js";
import {
  sendMessage,
  subscribeToMessages,
  markMessagesAsRead,
  deleteMessage,
  searchLoadedMessages
} from "./messages.js";
import {
  validateImageFile,
  cropAndResizeImage,
  uploadProfilePhoto,
  removeProfilePhoto
} from "./storage.js";
import {
  showToast,
  showConfirmModal,
  renderConversationsList,
  renderSearchResults,
  renderActiveChatMessages,
  escapeHTML,
  formatMessageTime
} from "./ui.js";

console.info('WhyMessenger: app.js loaded and all imports resolved.');

// Global Application State
const state = {
  currentUser: null,
  currentProfile: null,
  currentChatId: null,
  currentOtherUid: null,
  currentOtherProfile: null,
  conversations: [],
  activeMessages: [],
  cachedProfiles: new Map(),
  conversationsUnsub: null,
  messagesUnsub: null,
  pendingCropBlob: null,
  searchMatchIndices: [],
  currentSearchMatchIdx: -1
};

// ==========================================
// Initialization & Auth Flow
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  checkFirebaseConfiguration();
  bindAuthEvents();
  bindMainAppEvents();
  bindProfileModalEvents();
  bindMessageEvents();
  bindSearchEvents();
  bindInChatSearchEvents();
  bindVisibilityEvents();

  // Subscribe to authentication changes
  subscribeToAuthState(async (user) => {
    if (user) {
      state.currentUser = user;
      await handleUserLoggedIn(user);
    } else {
      handleUserLoggedOut();
    }
  });
});

/**
 * Checks if Firebase configuration has been customized.
 * Displays a non-intrusive alert if default placeholder keys are detected.
 */
function checkFirebaseConfiguration() {
  const banner = document.getElementById("config-warning-banner");
  if (!banner) return;
  if (!isFirebaseConfigured()) {
    banner.style.display = "flex";
    banner.classList.remove("hidden");
  } else {
    banner.style.display = "none";
    banner.classList.add("hidden");
  }
}

/**
 * Handles post-login data loading and UI transition.
 */
async function handleUserLoggedIn(user) {
  // Show app layout, hide auth layout
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");

  // Load private profile
  let privateProfile = await getPrivateProfile(user.uid);
  let publicProfile = await getPublicProfile(user.uid, true);

  state.currentProfile = {
    ...publicProfile,
    email: user.email,
    ...(privateProfile || {})
  };

  // Update bottom profile bar in sidebar
  updateUserProfileBar();

  // Subscribe to recent conversations
  subscribeToUserConversations();
}

/**
 * Handles logout cleanup.
 */
function handleUserLoggedOut() {
  // Unsubscribe listeners
  if (state.conversationsUnsub) {
    state.conversationsUnsub();
    state.conversationsUnsub = null;
  }
  if (state.messagesUnsub) {
    state.messagesUnsub();
    state.messagesUnsub = null;
  }

  state.currentUser = null;
  state.currentProfile = null;
  state.currentChatId = null;
  state.currentOtherUid = null;
  state.currentOtherProfile = null;
  state.conversations = [];
  state.activeMessages = [];

  // Reset UI views
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("auth-view").classList.remove("hidden");
  showChatEmptyState();
}

/**
 * Updates the user panel at the bottom of the Direct Messages sidebar.
 */
function updateUserProfileBar() {
  if (!state.currentProfile) return;
  const avatarEl = document.getElementById("current-user-avatar");
  const nameEl = document.getElementById("current-user-name");
  const tagEl = document.getElementById("current-user-tag");

  const avatarSrc = state.currentProfile.photoURL || generateInitialsAvatar(state.currentProfile.displayName, state.currentUser.uid);
  avatarEl.src = avatarSrc;
  nameEl.textContent = state.currentProfile.displayName || "User";
  tagEl.textContent = `@${state.currentProfile.username || "user"}`;
}

// ==========================================
// Conversations Management
// ==========================================

function subscribeToUserConversations() {
  if (state.conversationsUnsub) {
    state.conversationsUnsub();
  }

  state.conversationsUnsub = subscribeToRecentConversations(
    state.currentUser.uid,
    async (conversations) => {
      state.conversations = conversations;

      // Preload other participant profiles for rendering
      const otherUids = conversations.map((c) => c.otherUid).filter(Boolean);
      await preloadPublicProfiles(otherUids);

      // Populate cached profiles map
      for (const uid of otherUids) {
        const p = await getPublicProfile(uid);
        if (p) state.cachedProfiles.set(uid, p);
      }

      renderConversationsList({
        conversations: state.conversations,
        currentChatId: state.currentChatId,
        cachedProfiles: state.cachedProfiles,
        onSelectChat: (chatId, otherUid) => openConversation(chatId, otherUid)
      });
    },
    (error) => {
      console.warn("Conversations subscription error:", error);
    }
  );
}

/**
 * Opens a conversation, streams messages, and updates read receipts.
 */
async function openConversation(chatId, otherUid) {
  // If switching away from active messages subscription, clean up
  if (state.messagesUnsub) {
    state.messagesUnsub();
    state.messagesUnsub = null;
  }

  state.currentChatId = chatId;
  state.currentOtherUid = otherUid;

  // Fetch or retrieve other user's public profile
  state.currentOtherProfile = await getPublicProfile(otherUid);

  // Update Main Chat Header
  const headerAvatar = document.getElementById("active-chat-avatar");
  const headerName = document.getElementById("active-chat-name");
  const headerTag = document.getElementById("active-chat-tag");

  const avatarSrc = state.currentOtherProfile.photoURL || generateInitialsAvatar(state.currentOtherProfile.displayName, otherUid);
  headerAvatar.src = avatarSrc;
  headerName.textContent = state.currentOtherProfile.displayName;
  headerTag.textContent = `@${state.currentOtherProfile.username}`;

  // Hide empty state, reveal chat panel
  document.getElementById("chat-empty-state").classList.add("hidden");
  document.getElementById("active-chat-pane").classList.remove("hidden");

  // On mobile/tablet, hide sidebar when chat is active
  document.getElementById("sidebar").classList.add("mobile-hidden");

  // Update active highlight in conversation sidebar
  renderConversationsList({
    conversations: state.conversations,
    currentChatId: state.currentChatId,
    cachedProfiles: state.cachedProfiles,
    onSelectChat: (cId, oUid) => openConversation(cId, oUid)
  });

  // Subscribe to real-time messages
  state.messagesUnsub = subscribeToMessages(
    chatId,
    (messages) => {
      state.activeMessages = messages;
      renderActiveChatMessages({
        messages,
        currentUid: state.currentUser.uid,
        otherProfile: state.currentOtherProfile,
        onDeleteMessage: (msgId) => promptDeleteMessage(msgId)
      });

      scrollMessagesToBottom();

      // Automatically mark incoming messages as read
      markMessagesAsRead(chatId, state.currentUser.uid, messages);
    },
    (error) => {
      console.error("Messages stream error:", error);
      showToast("Error loading messages.", "error");
    }
  );

  // Focus message composer
  const composer = document.getElementById("message-input");
  if (composer) composer.focus();
}

function showChatEmptyState() {
  document.getElementById("chat-empty-state").classList.remove("hidden");
  document.getElementById("active-chat-pane").classList.add("hidden");
  state.currentChatId = null;
  state.currentOtherUid = null;
  state.currentOtherProfile = null;
}

function scrollMessagesToBottom(smooth = true) {
  const container = document.getElementById("messages-stream");
  if (container) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    });
  }
}

// ==========================================
// Messaging Events
// ==========================================

function bindMessageEvents() {
  const form = document.getElementById("message-composer-form");
  const input = document.getElementById("message-input");
  const charCounter = document.getElementById("char-counter");

  // Auto-expand textarea and update character counter
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";

    const count = input.value.length;
    if (charCounter) {
      charCounter.textContent = `${count}/2000`;
      charCounter.style.color = count > 1900 ? "#ed4245" : "var(--text-muted)";
    }
  });

  // Enter to send (Shift+Enter for newline)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !state.currentChatId) return;

    input.value = "";
    input.style.height = "auto";
    if (charCounter) charCounter.textContent = "0/2000";

    try {
      await sendMessage(state.currentChatId, state.currentUser.uid, text);
      scrollMessagesToBottom();
    } catch (error) {
      console.error("Failed to send message:", error);
      showToast(error.message || "Failed to send message.", "error");
    }
  });

  // Mobile Back button
  const mobileBackBtn = document.getElementById("mobile-back-btn");
  if (mobileBackBtn) {
    mobileBackBtn.addEventListener("click", () => {
      document.getElementById("sidebar").classList.remove("mobile-hidden");
    });
  }
}

function promptDeleteMessage(messageId) {
  showConfirmModal({
    title: "Delete Message",
    message: "Are you sure you want to delete this message? This cannot be undone.",
    confirmText: "Delete",
    onConfirm: async () => {
      try {
        await deleteMessage(
          state.currentChatId,
          messageId,
          state.currentUser.uid,
          state.currentUser.uid
        );
        showToast("Message deleted.", "info");
      } catch (error) {
        showToast(error.message || "Could not delete message.", "error");
      }
    }
  });
}

// ==========================================
// User Discovery & Search Events
// ==========================================

function bindSearchEvents() {
  const searchInput = document.getElementById("user-search-input");
  const clearBtn = document.getElementById("clear-search-btn");
  const convList = document.getElementById("conversations-list");
  const searchResults = document.getElementById("search-results-container");

  const performSearch = debounce(async (query) => {
    if (!query || query.trim().length < 2) {
      convList.classList.remove("hidden");
      searchResults.classList.add("hidden");
      return;
    }

    convList.classList.add("hidden");
    searchResults.classList.remove("hidden");

    renderSearchResults({
      results: [],
      isLoading: true,
      searchTerm: query,
      onStartChat: null
    });

    try {
      const results = await searchUsers(query, state.currentUser.uid, 12);
      renderSearchResults({
        results,
        isLoading: false,
        searchTerm: query,
        onStartChat: async (targetUid) => {
          try {
            // Explicit user creation
            const conv = await getOrCreateConversation(state.currentUser.uid, targetUid);
            // Reset search view
            searchInput.value = "";
            convList.classList.remove("hidden");
            searchResults.classList.add("hidden");
            // Open the conversation
            openConversation(conv.id, targetUid);
          } catch (err) {
            showToast(err.message || "Failed to start conversation.", "error");
          }
        }
      });
    } catch (error) {
      console.error("Search failed:", error);
      showToast("Error searching directory.", "error");
    }
  }, 300);

  searchInput.addEventListener("input", (e) => {
    const val = e.target.value;
    clearBtn.classList.toggle("hidden", val.length === 0);
    performSearch(val);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.classList.add("hidden");
    convList.classList.remove("hidden");
    searchResults.classList.add("hidden");
    searchInput.focus();
  });
}

// ==========================================
// In-Chat Message Search
// ==========================================

function bindInChatSearchEvents() {
  const toggleBtn = document.getElementById("toggle-msg-search-btn");
  const bar = document.getElementById("in-chat-search-bar");
  const input = document.getElementById("in-chat-search-input");
  const closeBtn = document.getElementById("close-msg-search-btn");
  const prevBtn = document.getElementById("search-prev-btn");
  const nextBtn = document.getElementById("search-next-btn");
  const countEl = document.getElementById("search-results-count");

  toggleBtn.addEventListener("click", () => {
    bar.classList.toggle("hidden");
    if (!bar.classList.contains("hidden")) {
      input.focus();
    } else {
      clearInChatSearch();
    }
  });

  closeBtn.addEventListener("click", () => {
    bar.classList.add("hidden");
    clearInChatSearch();
  });

  input.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
      countEl.textContent = "0 of 0";
      state.searchMatchIndices = [];
      state.currentSearchMatchIdx = -1;
      return;
    }

    const matches = searchLoadedMessages(state.activeMessages, query);
    state.searchMatchIndices = matches.map((m) => m.id);

    if (state.searchMatchIndices.length > 0) {
      state.currentSearchMatchIdx = state.searchMatchIndices.length - 1; // start with latest match
      countEl.textContent = `${state.currentSearchMatchIdx + 1} of ${state.searchMatchIndices.length}`;
      scrollToMatchedMessage(state.searchMatchIndices[state.currentSearchMatchIdx]);
    } else {
      state.currentSearchMatchIdx = -1;
      countEl.textContent = "0 of 0";
    }
  });

  prevBtn.addEventListener("click", () => {
    if (state.searchMatchIndices.length === 0) return;
    state.currentSearchMatchIdx =
      (state.currentSearchMatchIdx - 1 + state.searchMatchIndices.length) % state.searchMatchIndices.length;
    countEl.textContent = `${state.currentSearchMatchIdx + 1} of ${state.searchMatchIndices.length}`;
    scrollToMatchedMessage(state.searchMatchIndices[state.currentSearchMatchIdx]);
  });

  nextBtn.addEventListener("click", () => {
    if (state.searchMatchIndices.length === 0) return;
    state.currentSearchMatchIdx =
      (state.currentSearchMatchIdx + 1) % state.searchMatchIndices.length;
    countEl.textContent = `${state.currentSearchMatchIdx + 1} of ${state.searchMatchIndices.length}`;
    scrollToMatchedMessage(state.searchMatchIndices[state.currentSearchMatchIdx]);
  });

  function scrollToMatchedMessage(msgId) {
    const el = document.querySelector(`.message-row[data-message-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlight-flash");
      setTimeout(() => el.classList.remove("highlight-flash"), 1500);
    }
  }

  function clearInChatSearch() {
    input.value = "";
    countEl.textContent = "0 of 0";
    state.searchMatchIndices = [];
    state.currentSearchMatchIdx = -1;
  }
}

// ==========================================
// Profile Modal & Canvas Photo Cropper
// ==========================================

function bindProfileModalEvents() {
  const profileModal = document.getElementById("profile-modal");
  const openBtn = document.getElementById("open-profile-settings-btn");
  const closeBtn = document.getElementById("close-profile-modal-btn");
  const nameInput = document.getElementById("profile-display-name-input");
  const usernameDisplay = document.getElementById("profile-username-display");
  const emailDisplay = document.getElementById("profile-email-display");
  const avatarImg = document.getElementById("profile-modal-avatar");
  const saveBtn = document.getElementById("save-profile-btn");
  const emojiSelect = document.getElementById("emoji-select");
  const avatarColorInput = document.getElementById("avatar-color-input");

  // Live emoji/color preview
  function updateEmojiPreview() {
    if (!emojiSelect || !avatarColorInput || !avatarImg) return;
    const emoji = emojiSelect.value;
    const color = avatarColorInput.value;
    avatarImg.src = generateEmojiAvatar(emoji, color);
  }

  if (emojiSelect) emojiSelect.addEventListener("change", updateEmojiPreview);
  if (avatarColorInput) avatarColorInput.addEventListener("input", updateEmojiPreview);

  // Open profile modal
  openBtn.addEventListener("click", () => {
    if (!state.currentProfile) return;
    nameInput.value = state.currentProfile.displayName || "";
    usernameDisplay.textContent = `@${state.currentProfile.username || "user"}`;
    emailDisplay.textContent = state.currentProfile.email || state.currentUser.email;

    // Show current avatar
    const currentAvatar = state.currentProfile.photoURL
      || generateInitialsAvatar(state.currentProfile.displayName, state.currentUser.uid);
    avatarImg.src = currentAvatar;

    profileModal.classList.remove("hidden");
  });

  closeBtn.addEventListener("click", () => profileModal.classList.add("hidden"));
  profileModal.addEventListener("click", (e) => {
    if (e.target === profileModal) profileModal.classList.add("hidden");
  });

  // Save profile changes: display name + optional emoji avatar
  saveBtn.addEventListener("click", async () => {
    const newName = nameInput.value.trim();
    if (!newName) {
      showToast("Display name cannot be empty.", "error");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      // If emoji and color pickers are present, save an emoji avatar
      let newPhotoURL = state.currentProfile.photoURL || null;
      if (emojiSelect && avatarColorInput) {
        const emoji = emojiSelect.value;
        const color = avatarColorInput.value;
        newPhotoURL = generateEmojiAvatar(emoji, color);
      }

      await updateDisplayName(state.currentUser.uid, newName);
      state.currentProfile.displayName = newName;

      // Save emoji avatar to Firestore public profile
      if (newPhotoURL && newPhotoURL !== state.currentProfile.photoURL) {
        await updatePhotoURL(state.currentUser.uid, newPhotoURL);
        state.currentProfile.photoURL = newPhotoURL;
      }

      updateUserProfileBar();
      showToast("Profile updated successfully!", "success");
      profileModal.classList.add("hidden");
    } catch (err) {
      showToast(err.message || "Failed to update profile.", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }
  });
}

// ==========================================
// Authentication Event Handlers
// ==========================================

function bindAuthEvents() {
  // Tab toggling between Login and Register
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const formLogin = document.getElementById("form-login");
  const formRegister = document.getElementById("form-register");
  const forgotPasswordLink = document.getElementById("forgot-password-link");
  const forgotModal = document.getElementById("forgot-password-modal");
  const forgotCloseBtn = document.getElementById("close-forgot-modal-btn");
  const forgotForm = document.getElementById("forgot-password-form");

  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    formLogin.classList.remove("hidden");
    formRegister.classList.add("hidden");
  });

  tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    formRegister.classList.remove("hidden");
    formLogin.classList.add("hidden");
  });

  // Login Form Submission
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("login-submit-btn");

    btn.disabled = true;
    btn.innerHTML = `<span class="wm-spinner-inline"></span> Logging in...`;

    try {
      await loginUser(email, password);
      showToast("Welcome back!", "success");
    } catch (error) {
      showToast(formatAuthError(error), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Log In";
    }
  });

  // Register Form Submission
  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    const displayName = document.getElementById("reg-name").value;
    const username = document.getElementById("reg-username").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const confirmPassword = document.getElementById("reg-confirm-password").value;
    const btn = document.getElementById("reg-submit-btn");

    const validationError = validateRegistrationData({
      displayName,
      username,
      email,
      password,
      confirmPassword
    });

    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="wm-spinner-inline"></span> Creating Account...`;

    try {
      await registerUser({ displayName, username, email, password });
      showToast("Account created successfully! Welcome to WhyMessenger.", "success");
    } catch (error) {
      showToast(formatAuthError(error), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Create Account";
    }
  });

  // Forgot Password Modal
  forgotPasswordLink.addEventListener("click", (e) => {
    e.preventDefault();
    forgotModal.classList.remove("hidden");
  });

  forgotCloseBtn.addEventListener("click", () => forgotModal.classList.add("hidden"));
  forgotModal.addEventListener("click", (e) => {
    if (e.target === forgotModal) forgotModal.classList.add("hidden");
  });

  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("forgot-email").value;
    const btn = document.getElementById("forgot-submit-btn");

    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      await resetPassword(email);
      showToast("Password reset email sent! Check your inbox.", "success");
      forgotModal.classList.add("hidden");
      document.getElementById("forgot-email").value = "";
    } catch (error) {
      showToast(formatAuthError(error), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send Reset Link";
    }
  });

  // Google Sign-In Button Handler
  const googleBtn = document.getElementById("google-signin-btn");
  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      googleBtn.disabled = true;
      googleBtn.innerHTML = `<span class="wm-spinner-inline" style="border-top-color: #4285F4;"></span> Connecting to Google...`;
      try {
        await loginWithGoogle();
        showToast("Signed in with Google successfully!", "success");
      } catch (error) {
        showToast(formatAuthError(error), "error");
      } finally {
        googleBtn.disabled = false;
        googleBtn.innerHTML = `
          <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Continue with Google</span>
        `;
      }
    });
  }

  // Logout button
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      showConfirmModal({
        title: "Log Out",
        message: "Are you sure you want to log out of WhyMessenger?",
        confirmText: "Log Out",
        onConfirm: async () => {
          await logoutUser();
          showToast("Logged out successfully.", "info");
        }
      });
    });
  }
}

// ==========================================
// Main App & Window Events
// ==========================================

function bindMainAppEvents() {
  // Navigation rail items
  const navDms = document.getElementById("nav-rail-dms");
  const navSettings = document.getElementById("nav-rail-settings");

  navDms.addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("mobile-hidden");
  });

  navSettings.addEventListener("click", () => {
    document.getElementById("open-profile-settings-btn").click();
  });
}

function bindVisibilityEvents() {
  // Mark messages as read when user switches back to this browser tab
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.currentChatId && state.currentUser) {
      markMessagesAsRead(state.currentChatId, state.currentUser.uid, state.activeMessages);
    }
  });
}
