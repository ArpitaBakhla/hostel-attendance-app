# NightCheck — Domain Research

## Stack Research: WebAuthn + React PWA

### Key Findings
- **SimpleWebAuthn** is the industry standard library: `@simplewebauthn/browser` (frontend) + `@simplewebauthn/server` (backend). Handles all crypto complexity.
- WebAuthn is **fully supported** on iOS Safari, Android Chrome, and all modern browsers as of 2024+.
- **HTTPS is mandatory** — WebAuthn won't work on non-secure origins. Use localhost for dev (treated as secure context).
- **Never store biometric data** — only store the public key + credential ID. The private key never leaves the device's secure enclave.
- Device binding is implemented by storing the `credentialID` + `credentialPublicKey` in the DB linked to the user.
- For Supabase, WebAuthn verification must happen in a **Supabase Edge Function** (server-side) — not client-side.

### Recommended Flow
1. Backend generates challenge → sends to frontend
2. Frontend calls `startAuthentication()` → triggers native biometric prompt
3. Backend verifies response with stored public key → issues session

### Critical Decision
Use `@simplewebauthn/server` inside a **Supabase Edge Function** (Deno runtime). This keeps the verification logic server-side and away from client manipulation.

---

## Architecture Research: Supabase Multi-Tenant RLS

### Key Findings
- **Single-database, shared-schema** is the correct approach for multi-hostel. Separate databases per hostel is overengineering.
- Every table with hostel data needs a `hostel_id` column + indexed for performance (500+ students × multiple hostels).
- **RLS policies** must use `auth.uid()` to look up the user's `hostel_id` from a `profiles` table — never trust client-supplied `hostel_id`.
- **Never expose `service_role` key** client-side — use only in Edge Functions.
- Use `SECURITY DEFINER` functions carefully — prefer RLS policies over application-level filtering.

### Schema Pattern
```
auth.users → profiles (user_id, hostel_id, role)
hostels → students (hostel_id) → attendance_records (hostel_id)
                               → leave_applications (hostel_id)
                               → device_bindings (hostel_id)
```

### RLS Policy Pattern
```sql
CREATE POLICY "warden_sees_own_hostel" ON students
FOR ALL TO authenticated
USING (
  hostel_id = (SELECT hostel_id FROM profiles WHERE user_id = auth.uid())
);
```

---

## GPS Geofencing Research

### Key Findings
- Browser `navigator.geolocation` is **easily spoofable** (mock location apps, browser extensions, developer tools). It cannot be used as sole proof of location.
- **Defense-in-depth strategy** is required:
  1. Client sends GPS coords → server validates distance from hostel coords
  2. Server checks if coordinates look physically plausible (velocity checks if multiple submissions)
  3. IP-based geolocation as supplementary signal (not blocking — VPNs are common)
- PWAs **cannot run background geofencing** — only active/foreground location requests work.
- GPS accuracy in dense building environments can be ±50–100 m. Set geofence radius to **150 m** minimum to account for accuracy variance.

### Recommended Approach for NightCheck
- Client: collect coordinates with `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true })`
- Server (Edge Function): validate using Haversine formula. If outside radius → reject.
- **Accept that determined adversaries can still spoof** — this is a deterrent, not a guarantee. The multi-factor nature (fingerprint + device + GPS) makes combined spoofing very difficult.

---

## Pitfalls & Gotchas to Avoid

### WebAuthn
- **Passkey sync across devices**: Modern WebAuthn credentials may sync via iCloud Keychain or Google Password Manager, breaking device binding. Use `authenticatorAttachment: "platform"` + `residentKey: "required"` + `requireResidentKey: true` to prefer non-sync credentials, but this is not a guarantee on all platforms.
- **False rejections**: Fingerprint readers can fail (dirty sensors, cuts, wet fingers). Plan for warden fallback from Day 1.
- **Browser updates**: WebAuthn APIs can change behavior with browser updates — test on real devices.

### Supabase
- **Realtime subscriptions** require RLS-compatible policies — test carefully. Realtime respects RLS but has quirks with complex policies.
- **Edge Function cold starts**: First request after dormancy may take 500ms–2s. For a 30-min check-in window, pre-warm Edge Functions or use persistent connections.
- **Phone OTP rate limits**: Supabase has limits on SMS OTPs (Twilio-based). For 500+ students onboarding simultaneously, rate limiting may hit. Plan staggered onboarding.

### Leave Workflow
- **Time zone handling**: The 8:30–9:00 PM window must use the hostel's local time zone, not UTC. Store all times with timezone awareness.
- **Leave state machine**: Carefully model `pending → approved/denied` transitions. A student with a pending leave who checks in normally should be marked Present (not On Leave).

### Multi-Hostel
- **Missing `hostel_id` index**: Without indexes on `hostel_id` columns, queries will degrade severely at 500+ students.
- **Realtime channels**: Each warden dashboard should subscribe to a hostel-scoped channel, not a global one.
