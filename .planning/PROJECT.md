# NightCheck — Hostel Night Attendance System

## What This Is

**NightCheck** is a secure, fraud-resistant hostel night attendance system for large institutions (500+ students, multiple hostels). Students check in daily between **8:30–9:00 PM** using a React PWA with three layers of anti-proxy protection: **WebAuthn fingerprint authentication**, **device binding** (one enrolled device per student), and **GPS geofencing** (within ~50–100 m of the hostel building).

A separate **React warden dashboard** provides live attendance tracking, leave approval, device-change request handling, and manual override capabilities.

---

## Core Value

> Eliminate proxy attendance in hostels with hardware-level, location-aware check-in — while giving wardens full visibility and control over exceptions.

---

## Who It's For

| Role | What They Do |
|------|--------------|
| **Student** | Daily fingerprint check-in via PWA; submit leave applications; request device changes |
| **Warden** | Add/manage students per hostel; approve/deny leave & device-change requests; manual mark overrides; live dashboard view |
| **Super-Admin** | Manage wardens and hostel configuration (v1 scope TBD) |

---

## Onboarding Flow

1. **Warden adds student** — name, room number, roll number, registered phone number
2. **Student receives OTP** — sent to registered phone
3. **Student self-registers** — logs into PWA with OTP, enrolls their fingerprint (WebAuthn), binds their device
4. **Device is locked** — subsequent check-ins require the same bound device + fingerprint + GPS pass

---

## Attendance Statuses

| Status | Meaning |
|--------|---------|
| ✅ **Present** | Checked in via app within the window |
| ❌ **Absent** | Did not check in and no valid leave; warden can mark absent for unauthorized absence |
| 🏠 **On Leave** | Approved leave application covering this date |
| 🔧 **Excused** | Warden manually marked (device failure, emergency) |

**Rules:**
- Warden can mark absent for unauthorized departure (no prior leave applied)
- Warden **cannot** mark absent if student is already Present or On Leave
- After 10:00 PM, no further check-ins allowed; missed check-in = Absent by default

---

## Check-in Security Layers

1. **WebAuthn / FIDO2** — fingerprint verified on-device via browser credential API
2. **Device binding** — one enrolled device per student (BYOD: Android/iOS personal phones)
3. **GPS geofencing** — must be within configured radius (default 100 m) of hostel coordinates
4. **Time window** — 8:30–9:00 PM only; outside this window, check-in is blocked

---

## Leave Management

- Student submits leave from PWA: **from date**, **to date**, **reason text**
- Warden has a **2–8 hour approval window** during the day
- After 10 PM: warden unavailable; pending leaves reviewed from 9 AM the next day
- Approved leave → student marked **On Leave** for covered dates automatically
- Retroactive leave applications allowed (warden decides)
- No parent approval in v1

---

## Device Failure / Fallback

- Student can submit a **device issue report** (reason text) via any browser without fingerprint
- Warden reviews and can:
  - Mark student **Excused** (present with override)
  - Mark student **Absent** (if they believe it's unauthorized)
- No OTP-based fallback check-in in v1 (warden is the single exception authority)

---

## Device-Change Requests

- Student submits a device-change request (reason + new device info)
- Only one bound device at a time per student
- Warden approves or denies from dashboard
- Warden can force-unbind any device directly from dashboard

---

## Multi-Hostel Structure

- Each hostel has its own warden login and isolated data view
- Wardens only see students in their assigned hostel
- Each hostel has its own GPS geofence center + radius
- Super-admin can see across all hostels (v1 scope: basic)

---

## Warden Dashboard

- **Live view**: Real-time attendance status as students check in (Supabase Realtime)
- **Today's roll**: All students listed with current status (Present / Absent / On Leave / Excused)
- **Historical lookup**: Search past dates per student
- **Student profile**: Individual attendance history
- **Pending queue**: Leave requests + device-change requests pending approval
- **Manual override**: Mark any student with any status + reason note
- No export/report in v1

---

## Tech Stack (Decided)

| Layer | Technology |
|-------|-----------|
| Frontend (Student PWA) | React + PWA (service worker, offline-capable) |
| Frontend (Warden Dashboard) | React (separate app or routes) |
| Backend / DB | Supabase (PostgreSQL + Supabase Auth + Realtime) |
| Authentication (Students) | Supabase Auth (OTP/phone) + WebAuthn (FIDO2) |
| Authentication (Wardens) | Supabase Auth (email + password) |
| Geofencing | Browser Geolocation API + server-side validation |
| Hosting | TBD (Vercel / Netlify likely) |

---

## Requirements

### Validated

*(None yet — ship to validate)*

### Active

- [ ] Student PWA with WebAuthn fingerprint check-in
- [ ] GPS geofencing validation (client + server)
- [ ] Device binding — one device per student, persisted in DB
- [ ] Time-window enforcement (8:30–9:00 PM)
- [ ] Warden dashboard with live Supabase Realtime attendance feed
- [ ] Leave application workflow (student submit → warden approve/deny)
- [ ] Device-change request workflow (student submit → warden approve/deny)
- [ ] Device issue / fallback report (student submits → warden acts)
- [ ] Manual override by warden (mark any status + reason)
- [ ] Multi-hostel data isolation (warden sees only their hostel)
- [ ] Student onboarding: OTP → fingerprint enrollment → device binding
- [ ] Attendance status system: Present / Absent / On Leave / Excused
- [ ] Historical attendance lookup per student (warden view)

### Out of Scope (v1)

- Export/PDF/Excel reports — too early, focus on core reliability first
- Parent/guardian approval in leave flow — adds complexity without core value
- OTP-based fallback check-in — warden manual override is the fallback
- Push notifications to students — can add in v2
- Super-admin cross-hostel analytics — basic in v1 only

---

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebAuthn (not face recognition) | Native browser API, no third-party dependency, hardware-bound | Chosen |
| Single bound device per student | Prevents multi-device sharing; simplicity | Chosen |
| Supabase (not custom backend) | Fast to ship, built-in Auth + Realtime + RLS row security | Chosen |
| Server-side GPS validation | Client-only geofence is spoofable; must validate on backend | Chosen |
| No export in v1 | Warden dashboard is sufficient; export is a v2 polish feature | Deferred |
| Warden is fallback authority | No OTP fallback — keeps check-in security model clean | Chosen |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-01 after initialization*
