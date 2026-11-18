# Hobbyvelvet

Create a premium, ultra-fast, real-time, highly polished private Web Application named "TALK" (4-letter unique, simple name).



---



### 🚫 1. STRICT PRIVACY & CLEAN ZERO-BRANDING UI

- **NO LOGOS, BANNERS OR DEFAULT FOOTERS:** Strictly ZERO logos, icons, application branding, watermarks, or banners anywhere in the entire app.

- **FOOTER POLICY:** Completely remove all hardcoded default footer texts like "Made by NAVYA PANCHAL" or master credits. The app must remain clean, minimal, and 100% private.

- **Dynamic Header:** Displays only the currently logged-in active user's name, profile picture, status, and action controls.



---



### 🔐 2. USER PERSISTENCE, AUTHENTICATION & MASTER CONTROL

- **App-Level Custom Keypad:** Built-in 4-digit PIN pad UI on the home screen (Do not use browser/system native numeric keyboards for PIN entry).

- **Persistent Database Storage:** Once a user is created by the Master User, their account, credentials, and settings MUST persist permanently in the database across app reloads, browser closures, or days of inactivity until explicitly deleted by the Master User.

- **Master User Controls:**

  - **Master PIN:** `3202`

  - **Master User Dashboard:** Contains a dedicated "Create New User" form with: User Display Name, Date of Birth, Gender (Boy/Girl toggle), Profile Picture, Assigned 4-digit Chat PIN, and Assigned 4-digit Hobby PIN.

  - **Dynamic Multi-User Authentication:**

    - When User A (e.g., "Alex") enters their assigned PIN (e.g., `0000`), the app MUST log in strictly as "Alex". The header must display "Alex", his profile picture, and his individual options. Master User details MUST NOT appear anywhere in User A's session.

    - Master User can also chat, audio call, and video call in real-time with any created user.

- **Two-Step User Deletion Workflow:**

  - Master User panel lists created profiles with a "Delete User" button.

  - Clicking "Delete User" opens a popup modal with the text: **"You are accepted to delete."**

  - Clicking the secondary "Delete" button inside the modal permanently removes the user and their associated data.

- **PIN Routing & Screen Lock:**

  - Chat PIN -> Directly opens personalized Chat UI.

  - Hobby PIN -> Directly opens the Hobby & Games Section.

  - Header controls include: Voice Call, Video Call, **"Go to Hobby"**, and **"Lock App"** (instantly locks back to the Home PIN keypad).

  - **Tab Switching Lock:** Switching tabs or minimizing the browser immediately locks the app to the PIN screen while keeping chat history preserved in the backend.



---



### 💬 3. GEMINI-STYLE FLOATING PROMPT BOX & CHAT SYSTEM

- **Floating Input Box (Gemini-Style Behavior - CRITICAL):**

  - Floating message input box sticky near the bottom.

  - **When Tapped (Keyboard Opens):** ONLY the floating prompt box shifts smoothly upward to rest floating right above the open keyboard (matching Gemini app behavior). The main screen/page body MUST NOT shift up or distort.

  - **Full Scrollability:** Users can freely scroll up and down through the chat history while the keyboard is active and the prompt box is floating.

  - Device back button cleanly closes the keyboard without wiping draft input.

- **Real-Time WhatsApp Experience:**

  - Header shows contact details, online/offline status, call buttons.

  - Typing Indicator: Displays **"[User Name] is typing..."** when active, auto-clears when idle.

- **Message Management & Real-Time Deletion:**

  - Users can delete their own messages, syncs instantly for both participants.

  - Header options menu includes:

    1. **"Select Messages to Delete"** (Multi-select delete).

    2. **"Delete All Messages"** (Wipes active chat session history).

- **Rich Media & Custom Tones:**

  - Supports Emojis, Image sharing, Video sharing, and Voice Messages (press-to-record snippets).

  - 10 custom notification sound choices per user (triggers audio tone only, zero push popups).



---



### 📞 4. REAL-TIME AUDIO & VIDEO CALL SYSTEM

- **Presence Check:** Calling is enabled only when the target recipient status is active/online in the app.

- **Call Overlay Screen:** WhatsApp-style full-screen call UI with live timer, microphone mute, camera toggle/flip, and end call button.



---



### 🏓 5. HOBBY & GAMES SECTION (Strict Navigation Rules)

- **Direct Navigation:** Clicking "Go to Hobby" in the chat header routes directly to the Hobby page without re-entering PIN.

- **20 Interactive Games & Interactive Guides:** Includes Cricket + 19 other sports/games with step-by-step "How to Play" interactive rules.

- **Strict Navigation Rules:**

  - **NO "Back to Chat"** button inside the Hobby section.

  - Only a single **"Back to Home"** arrow button (returns straight to Home PIN keypad).



---



### ⚡ 6. TECH & BACKEND ARCHITECTURE

- Real-time backend synchronization using Supabase/Firebase for instant messaging, status syncing, call signaling, and multi-user data persistence.

Exact app

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://hobbyvelvet.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f1dc0658-1b42-4898-9e1a-8eb258450c67).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
