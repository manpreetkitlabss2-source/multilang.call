
## 🔒 Core System Rules

* Strictly follow the defined **monorepo structure, architecture, and tech stack**. 
* Do **not introduce alternative architectures or technologies**. 
* Implement **only required features for the current phase**. 

---

## 🧠 Data & State Rules

* **MySQL = persistent data only** (meetings, users, etc.). 
* **Redis = real-time state only** (participants, language rooms, cache). 
* Do **not write live call state to MySQL**. 
* Zustand stores only **UI/session data (non-persistent)**. 

---

## 🎤 Audio Pipeline Rules

* Must follow exact flow:
  **Audio → STT → Translate → TTS → Targeted delivery**. 
* Use **VAD (silence detection)** before sending audio. 
* Do **not send partial speech/audio chunks**. 
* Translated audio must be sent **only to target language rooms**. 

---

## 🎧 UX & Latency Rules

* Original audio plays at **20% volume**. 
* Translated audio plays at **100% with crossfade**. 
* TTS must **queue sequentially (no overlap)**. 
* Use **Redis caching for repeated translations (TTL 1h)**. 

---

## 🎨 UI Rules

* Must use **existing Tailwind tokens only** (no new styles/plugins). 
* Maintain **consistent design patterns (buttons, inputs, cards)**. 

---

## 🔐 Auth & Security Rules (Phase 2)

* Use **JWT-based auth only (no third-party auth)**. 
* Store JWT in **localStorage (not cookies)**. 
* Protect routes except: `/auth/*`, `/invite/*`, `/s/*`. 

---

## 🚪 Waiting Room Rules

* **No auto-admit participants** — host approval is mandatory. 
* Join flow must be: **Knock → Host Admit/Deny → Join**. 

---

## 🔗 Magic Link Rules

* Tokens must be **unique, expirable, and validated before join**. 
* Do **not mark link as used until actual join**. 

---

## 📅 Scheduling Rules

* Scheduled meeting must **convert to live meeting before joining**. 
* Use **shareToken for public access links**. 

---

## ⚙️ Implementation Rules

* Follow **strict feature implementation order**. 
* Do **not modify existing working systems (especially translation pipeline)**. 
* Extend models — **never break existing schema**. 

---

## 🚫 Explicit “DO NOT” Rules

* Do not modify AI pipeline (`packages/ai-pipeline`). 
* Do not add billing, subscriptions, or unrelated features. 
* Do not replace Zustand with another state manager. 
* Do not change Tailwind config. 
* Do not add email logic without proper service abstraction. 
