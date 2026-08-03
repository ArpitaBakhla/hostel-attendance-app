# 🌙 NightCheck

**Secure, fraud-resistant hostel night attendance system for large institutions.**

Students check in nightly (8:30–9:00 PM) using a React PWA with three layers of anti-proxy protection: **WebAuthn fingerprint auth**, **device binding**, and **GPS geofencing**. Wardens get a real-time dashboard for attendance tracking, leave approval, and manual overrides.

---

## ✨ Features

### Student PWA
- **Biometric check-in** — WebAuthn / FIDO2 fingerprint verification
- **One device per student** — device binding prevents proxy attendance
- **GPS geofencing** — must be within ~100 m of hostel to check in
- **Offline support** — queues check-ins when offline, syncs when back online
- **Leave applications** — submit from/to dates with reason
- **Device issue reporting** — report broken devices for warden review

### Warden Dashboard
- **Live attendance feed** — real-time updates via Supabase Realtime
- **Today's roll** — all students with status (Present / Absent / On Leave / Excused)
- **Pending queue** — leave requests + device-change requests
- **Manual overrides** — mark any student with any status + reason note
- **Student management** — add students, manage device bindings
- **Historical lookup** — per-student attendance history

### Security
- 4-layer check-in verification (WebAuthn + device bind + GPS + time window)
- Server-side GPS validation (client geolocation is spoofable)
- AES-256 PII encryption at rest
- Row Level Security (RLS) on all tables
- Rate limiting on all edge functions
- Multi-hostel data isolation

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 |
| PWA | Vite PWA plugin (service worker, offline-capable) |
| Routing | React Router v7 |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase PostgreSQL + RLS |
| Auth (Students) | Phone OTP + WebAuthn (FIDO2) |
| Auth (Wardens) | Email + Password (Supabase Auth) |
| Realtime | Supabase Realtime |
| Hosting | Vercel / Netlify (frontend) + Supabase (backend) |

---

## 📁 Project Structure

```
nightcheck/
├── src/                          # React frontend
│   ├── pages/
│   │   ├── student/              # Student-facing pages
│   │   │   ├── StudentLoginPage  #   OTP login
│   │   │   ├── EnrollPage        #   WebAuthn enrollment + device bind
│   │   │   ├── CheckInPage       #   Nightly check-in flow
│   │   │   └── MalfunctionPage   #   Device issue reporting
│   │   └── warden/               # Warden-facing pages
│   │       ├── WardenLoginPage   #   Email/password login
│   │       ├── WardenHomePage    #   Dashboard with live feed
│   │       └── AddStudentPage    #   Register new students
│   ├── components/               # Reusable UI components
│   ├── lib/                      # Core libraries
│   │   ├── api.ts                #   API client for edge functions
│   │   ├── supabase.ts           #   Supabase client init
│   │   ├── geo.ts                #   Geolocation / geofencing
│   │   ├── encryption.ts         #   Client-side encryption helpers
│   │   ├── sync-manager.ts       #   Offline queue + background sync
│   │   ├── offline-store.ts      #   IndexedDB persistence
│   │   ├── session.ts            #   Session management
│   │   └── time-window.ts        #   Check-in window enforcement
│   └── types/                    # TypeScript type definitions
│
├── supabase/
│   ├── functions/                # Supabase Edge Functions (Deno)
│   │   ├── check-in/             #   Attendance check-in endpoint
│   │   ├── otp-send/             #   Send OTP to student phone
│   │   ├── otp-verify/           #   Verify OTP code
│   │   ├── webauthn-register/    #   WebAuthn credential registration
│   │   ├── warden-action/        #   Warden dashboard actions
│   │   ├── device-change-request/#   Device change workflow
│   │   ├── malfunction-report/   #   Device issue reports
│   │   ├── backup-snapshot/      #   Automated backup snapshots
│   │   └── _shared/              #   Shared utilities
│   │       ├── db.ts             #     Database helpers
│   │       ├── http.ts           #     CORS, rate limiting, response
│   │       ├── otp.ts            #     OTP generation + verification
│   │       ├── webauthn.ts       #     WebAuthn server-side logic
│   │       ├── crypto.ts         #     Encryption utilities
│   │       ├── attendance.ts     #     Attendance record helpers
│   │       └── deps.ts           #     Shared dependencies
│   ├── migrations/               # PostgreSQL migrations
│   └── config.toml               # Supabase local dev config
│
├── tests/
│   └── stress/                   # Stress & integration tests
│       ├── run-all.sh            #   Run full test suite
│       ├── concurrent-checkin.ts #   Concurrent check-in load test
│       ├── data-integrity.ts     #   Data integrity verification
│       └── backup-verification.ts#   Backup system verification
│
├── dist/                         # Production build output
├── .env.example                  # Environment variable template
├── vite.config.ts                # Vite + PWA + Tailwind config
├── package.json                  # Dependencies & scripts
└── tsconfig.json                 # TypeScript configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Supabase CLI** — `npm install -g supabase`
- **Docker** — required for local Supabase stack
- A **Supabase project** (free tier works) — [supabase.com](https://supabase.com)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/nightcheck.git
cd nightcheck
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase project credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
```

### 3. Set Up Database

```bash
# Option A: Push migrations to your remote Supabase project
npx supabase db push

# Option B: Run a full local Supabase stack
npx supabase start
npx supabase db reset
```

### 4. Start Development

```bash
# Terminal 1 — Frontend dev server (http://localhost:5173)
npm run dev

# Terminal 2 — Edge Functions (http://localhost:54321/functions/v1/*)
npx supabase functions serve
```

---

## 🧪 Testing

### Stress Tests

The stress test suite runs against a live Supabase instance. Set the required env vars first:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

```bash
# Run all stress tests
npm run test:stress

# Run individually
npm run test:stress:checkin      # Concurrent check-in load test
npm run test:stress:integrity    # Data integrity verification
npm run test:stress:backup       # Backup system verification
```

### Linting

```bash
npm run lint
```

---

## 🚢 Deployment

### Frontend → Vercel / Netlify

```bash
# Build production bundle
npm run build

# Deploy (Vercel)
npx vercel --prod

# Deploy (Netlify)
npx netlify deploy --prod --dir=dist
```

Set these env vars in your hosting provider's dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Edge Functions → Supabase

```bash
# Deploy all functions
npx supabase functions deploy

# Set production secrets
npx supabase secrets set ENCRYPTION_MASTER_KEY=your-key
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-key
npx supabase secrets set WEBAUTHN_RP_ID=your-domain.com
npx supabase secrets set WEBAUTHN_ORIGIN=https://your-domain.com
npx supabase secrets set ALLOWED_ORIGIN=https://your-domain.com
```

---

## ⚙️ Environment Variables

| Variable | Required | Used By | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Frontend | Supabase public/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Edge Functions | Supabase admin key (never expose to client) |
| `ENCRYPTION_MASTER_KEY` | ✅ | Edge Functions | AES-256 key for PII encryption |
| `WEBAUTHN_RP_ID` | Production | Edge Functions | Your domain (e.g., `nightcheck.app`) |
| `WEBAUTHN_ORIGIN` | Production | Edge Functions | Full origin URL |
| `ALLOWED_ORIGIN` | Production | Edge Functions | CORS allowed origin |
| `TWILIO_ACCOUNT_SID` | Optional | Edge Functions | Twilio SMS (falls back to console log) |
| `TWILIO_AUTH_TOKEN` | Optional | Edge Functions | Twilio auth |
| `TWILIO_FROM_NUMBER` | Optional | Edge Functions | Twilio sender number |
| `OTP_ECHO` | Dev only | Edge Functions | Echo OTP in API responses |

---

## 📱 User Flows

### Student Onboarding
1. Warden adds student (name, room, roll number, phone)
2. Student receives OTP on registered phone
3. Student opens PWA → enters OTP → enrolls fingerprint (WebAuthn)
4. Device is bound — all future check-ins require this device + fingerprint + GPS

### Nightly Check-in
1. Student opens PWA between **8:30–9:00 PM**
2. App verifies GPS location (within hostel geofence)
3. Student authenticates with fingerprint (WebAuthn)
4. Server validates credential + location + time window
5. Student marked **Present** ✅

### Attendance Statuses

| Status | Meaning |
|---|---|
| ✅ Present | Checked in via app within the window |
| ❌ Absent | No check-in and no valid leave |
| 🏠 On Leave | Approved leave covering this date |
| 🔧 Excused | Warden manual override (device failure, emergency) |

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run test:stress` | Run full stress test suite |
| `npm run test:stress:checkin` | Concurrent check-in load test |
| `npm run test:stress:integrity` | Data integrity verification |
| `npm run test:stress:backup` | Backup system verification |

---

## 📄 License

This project is private and not licensed for public distribution.
