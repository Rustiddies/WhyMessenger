# WhyMessenger

> **"Your conversations. Your community."**  
> *A Desktop-Grade Real-Time One-to-One Messaging Web Application inspired by Discord.*  
> **Academic Project:** Third-Year B.Sc. Computer Science Semester Research Project.

---

## 1. Overview & Vision

**WhyMessenger** is an asynchronous, event-driven, real-time messaging client designed to bring the polished ergonomics and visual hierarchy of desktop communication tools like Discord to a pure, zero-build web architecture.

Built without external UI libraries or heavyweight bundling toolchains, WhyMessenger runs directly on standard web technologies: **HTML5, CSS3, and native JavaScript ES Modules**, backed by Google Firebase's modular CDN SDK (v10.12.2) for **Authentication, Cloud Firestore, and Cloud Storage**.

---

## 2. Technology Stack & Design Constraints

| Layer | Technology | Architectural Role |
|---|---|---|
| **Frontend Presentation** | Semantic HTML5 & CSS3 | Discord-style 3-column layout, custom dark theme, responsive grid/flexbox |
| **Logic & State** | Vanilla JavaScript (ES6+ Modules) | Modular client-side architecture (`import`/`export`), no bundlers, no build steps |
| **Identity & Access** | Firebase Authentication v10.12.2 CDN | Email/Password, session persistence, password reset |
| **Database & Pub/Sub** | Cloud Firestore v10.12.2 CDN | Multi-collection document store with real-time `onSnapshot` listeners |
| **Media & Blobs** | Firebase Cloud Storage & Canvas API | Client-side 512×512 square crop, compression, resumable uploads, Spark fallback |
| **Vectors & Typography** | Inline/External SVG & Google Fonts | Custom WhyMessenger branding, Inter typography, vector status badges |

### Strict Technical Constraints Met
1. **Zero Frameworks:** No React, Angular, Vue, Svelte, or UI libraries.
2. **Zero Server Runtimes:** No Node.js, Express, Python, or MongoDB backend.
3. **Zero Build Dependencies:** No npm, Webpack, Vite, Rollup, or Babel.
4. **Native Modules:** Clean separation of concerns across 10 dedicated ES modules.
5. **Deterministic Topology:** Conversation IDs computed via `[uidA, uidB].sort().join('_')`.
6. **Spark-Plan Resilient:** Graceful handling of Cloud Storage pay-as-you-go limitations with fallback avatars.

---

## 3. Project File Structure

```
WhyMessenger/
│
├── index.html                  # Master application shell & modal definitions
├── favicon.svg                 # SVG brand favicon
├── README.md                   # Setup guide, deployment, and architecture overview
├── RESEARCH_NOTES.md           # B.Sc. academic research documentation & benchmarks
│
├── assets/
│   ├── logo.svg                # Modern purple rounded-square with bold white 'W'
│   └── default-avatar.svg      # Minimalist user silhouette vector
│
├── css/
│   └── styles.css              # Discord dark-theme design tokens & responsive media queries
│
├── js/
│   ├── firebase-config.js      # Firebase configuration object and setup checks
│   ├── firebase.js             # Firebase Modular SDK (v10.12.2) singleton exports
│   ├── auth.js                 # Authentication, validation, and username uniqueness
│   ├── profiles.js             # Profile management, public caching, and initials generator
│   ├── discovery.js            # Debounced prefix queries on public discovery directory
│   ├── conversations.js        # Deterministic chat IDs, recent chats real-time sync
│   ├── messages.js             # Real-time message streaming, read receipts, message deletion
│   ├── storage.js              # Canvas image preprocessing, Storage upload, Spark fallback
│   ├── ui.js                   # DOM rendering, Discord layout components, toasts, modals
│   └── app.js                  # Master application orchestrator and event binder
│
├── firestore.rules             # Production security rules enforcing ownership & participant boundaries
├── storage.rules               # Storage bucket rules for profile pictures
└── firestore.indexes.json      # Cloud Firestore compound indexes for chats and search
```

---

## 4. Quick Start: Running with VS Code Live Server

WhyMessenger is optimized to run effortlessly in local development without package managers or CLI build commands:

1. **Install Live Server in VS Code:**
   - Open Visual Studio Code.
   - Go to Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X`).
   - Search for **Live Server** (by *Ritwick Dey*) and click **Install**.

2. **Open the Project Folder:**
   - In VS Code, choose **File > Open Folder...**
   - Select the `WhyMessenger` folder:  
     `C:\Users\suraj\.gemini\antigravity\scratch\WhyMessenger`

3. **Start the Application:**
   - Right-click `index.html` in the VS Code Explorer.
   - Select **Open with Live Server** (or click **Go Live** at the bottom status bar).
   - Your browser will open automatically at `http://127.0.0.1:5500/index.html`.

---

## 5. Firebase Configuration & Deployment

### Step 5.1: Connecting Your Firebase Project
Target Firebase Project:
- **Project Name:** WhyMessenger
- **Project ID:** `whymessenger`

Open `js/firebase-config.js` and paste your web app credentials copied from the [Firebase Console](https://console.firebase.google.com/):
```javascript
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "whymessenger.firebaseapp.com",
  projectId: "whymessenger",
  storageBucket: "whymessenger.firebasestorage.app",
  messagingSenderId: "123456789...",
  appId: "1:123456789:web:abcdef..."
};
```

### Step 5.2: Deploying Cloud Firestore Security Rules
1. In the Firebase Console, go to **Build > Firestore Database > Rules**.
2. Replace existing rules with the contents of `firestore.rules`.
3. Click **Publish**.

### Step 5.3: Deploying Firestore Indexes
Run the Firebase CLI command from the `WhyMessenger` directory:
```bash
firebase deploy --only firestore:indexes
```
*Alternatively, Firestore will auto-generate one-click creation links in the browser console when running compound queries for the first time.*

### Step 5.4: Storage Bucket & Spark Plan Policy
- **Billing Tier Safeguard:** The current project uses Firebase's free **Spark plan**. Google Cloud Storage typically requires a Blaze pay-as-you-go plan to activate default buckets.
- **WhyMessenger Resilience:** WhyMessenger includes complete Cloud Storage code (`uploadBytesResumable`, `getDownloadURL`), but wraps uploads in an intelligent fallback boundary. If Cloud Storage throws a bucket or billing error, WhyMessenger automatically produces an optimized client-side compressed avatar stored directly in `publicProfiles/{uid}`, with a user-friendly toast notice. **No forced billing upgrades occur.**

---

## 6. Public Cloud Deployment on Vercel

WhyMessenger is fully optimized for static deployment on **Vercel** with zero build configuration.

### 6.1 GitHub Repository Setup
1. Create a new repository on [GitHub](https://github.com/new) named `WhyMessenger`.
2. Push your project files to the repository:
   ```bash
   git init
   git add .
   git commit -m "Initial WhyMessenger production release"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/WhyMessenger.git
   git push -u origin main
   ```
   *(Alternatively, if using the GitHub Web UI or GitHub Desktop, drag and drop the WhyMessenger folder contents into the repository).*

### 6.2 Deploying on Vercel
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New... > Project**.
3. Select your GitHub repository (`WhyMessenger`) and click **Import**.
4. Configure the Project Settings:
   - **Framework Preset:** `Other`
   - **Root Directory:** `./`
   - **Build Command:** *(Leave blank)*
   - **Output Directory:** *(Leave blank or `.`)*
   - **Install Command:** *(Leave blank)*
5. Click **Deploy**.
6. Vercel will build and assign an HTTPS URL (e.g., `https://whymessenger.vercel.app`).

### 6.3 Crucial Step: Authorizing Vercel Domain in Firebase
To allow authentication (Email/Password & Google Sign-In) on your Vercel URL:
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Navigate to **Authentication > Settings > Authorized domains**.
3. Click **Add domain**.
4. Enter your exact Vercel production hostname without `https://` or trailing slashes:
   `whymessenger.vercel.app` (or your assigned Vercel domain).
5. Click **Done**.

> [!NOTE]  
> Keep `localhost` in your Authorized domains list so local testing via VS Code Live Server continues to work simultaneously.

---

## 6. Core Product Architecture & Workflows

### 6.1 Authentication & Unique Usernames
- Full registration pipeline validates names, emails, and passwords ($\ge 6$ characters).
- Username uniqueness is guaranteed using a Cloud Firestore transaction on the `usernames/{usernameLower}` collection before profile initialization.
- Profiles are partitioned into:
  - `users/{uid}`: Private profile (contains email address; readable only by owner).
  - `publicProfiles/{uid}`: Public directory (contains display name, handle, avatar; searchable by authenticated users).

### 6.2 Search-First User Discovery
- To protect user privacy and prevent indiscriminate user dumping, **new users see an empty conversation list**.
- The search bar queries Firestore using lexicographical prefix bounds:
  $$\text{startAt}(q) \quad \text{to} \quad \text{endAt}(q + \text{"\textbackslash uf8ff"})$$
- Input is debounced at 300ms and requires at least 2 characters.
- Searching or viewing a result **never** creates database documents. Conversations are only instantiated upon an explicit "Message" action.

### 6.3 Real-Time One-to-One Messaging
- Messages are streamed via `onSnapshot` on the subcollection:
  `chats/{chatId}/messages`
- New messages use Firestore's `serverTimestamp()` for synchronization across client clocks.
- Senders can delete their own messages via hover menus; deletion is strictly validated by Firestore rules.

### 6.4 True Read Receipts (`Sent` vs `Seen`)
- Every message document contains a nullable `readAt` field.
- **Sent:** Document exists in Firestore with `readAt: null`.
- **Seen:** Recipient actively views the conversation with the browser tab visible (`document.visibilityState === 'visible'`), triggering a Firestore batch update to stamp `readAt = serverTimestamp()`.
- Senders see live receipt status updates without page reloads.

---

## 7. Security Model Summary

| Resource | Read Constraint | Write / Update Constraint |
|---|---|---|
| `users/{uid}` | Owner only (`request.auth.uid == uid`) | Owner only |
| `publicProfiles/{uid}` | Authenticated users | Owner only |
| `usernames/{usernameLower}` | Authenticated users | Owner create-only if unreserved |
| `chats/{chatId}` | Conversation participants only | Participants only; `participants` array is immutable |
| `chats/{chatId}/messages/{msgId}` | Conversation participants only | **Create:** Author only; **Update:** Recipient only (mutates `readAt` exclusively); **Delete:** Author only |
| Storage `profilePictures/{uid}/avatar` | Authenticated users | Owner only; $\le 2\text{ MB}$; image mime types only |

---

## 8. Manual Testing Checklist (3-User Matrix)

To execute an end-to-end validation across multiple sessions:
1. Open three separate browser sessions:
   - Session A: Normal Chrome window.
   - Session B: Incognito Chrome window.
   - Session C: Firefox or Edge window.
2. **Account 1 (Alice):** Register `alice@whymessenger.test`, username `@alice_m`.
3. **Account 2 (Bob):** Register `bob@whymessenger.test`, username `@bob_builder`.
4. **Account 3 (Charlie):** Register `charlie@whymessenger.test`, username `@charlie_x`.
5. Observe that Alice's DM sidebar is completely empty on initial login.
6. Search for `bob` in Alice's search bar. Click **Message** to initiate the first conversation.
7. Send a message from Alice to Bob:
   - Alice sees status: **Sent ✓**.
   - Bob receives the message in real-time without refreshing.
   - Bob opens Alice's chat: Alice's status changes to **Seen ✓✓** in real time.
8. Attempt cross-user access: Verify in Charlie's session that Charlie cannot see or access the conversation between Alice and Bob.
