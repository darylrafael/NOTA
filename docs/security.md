# NOTA — Security Architecture

## Threat Model

NOTA is a mobile application without traditional user authentication (no login/signup). This design decision was intentional — requiring account creation before scanning the first receipt creates friction that harms adoption for a personal finance tool.

**Consequence**: The mobile client is fundamentally untrusted. Any value embedded in the client bundle (including `EXPO_PUBLIC_*` environment variables) should be considered publicly readable.

## Architecture

```
┌──────────────────────────────────┐
│        Mobile App (UNTRUSTED)    │
│                                  │
│  Camera → Image Compression      │
│  Local SQLite (private)          │
│  Anonymous device_id             │
│  POST /api/extract               │
└──────────────┬───────────────────┘
               │ HTTPS (JSON)
               ▼
┌──────────────────────────────────┐
│        BFF Proxy (TRUSTED)       │
│                                  │
│  Request validation              │
│  Payload limit (2MB)             │
│  IP rate limiting (20/15min)     │
│  Device quota (50/day)           │
│  Upstream timeout (12s)          │
│  Structured logging              │
│  Error normalization             │
│                                  │
│  GEMINI_API_KEY (server-only)    │
│  GEMINI_MODEL (server-only)      │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│      Gemini 2.5 Flash API        │
└──────────────────────────────────┘
```

## API Key Protection

The Gemini API key exists **only** in the server environment (`process.env.GEMINI_API_KEY`). It is never:
- Prefixed with `EXPO_PUBLIC_` (which Expo inlines into the client bundle)
- Referenced in any client-side TypeScript/JavaScript file
- Present in the generated production bundle (verified via `scripts/verify-bundle.js`)

### Verification Method

`scripts/verify-bundle.js` performs an **automated static bundle inspection** (not a cryptographic proof). It:
1. Runs `npx expo export` to generate production artifacts
2. Scans all `.js` and `.json` files in the output for the known API key value
3. Reports PASS/FAIL

**Limitation**: This is a string-search audit. It does not detect obfuscated or encoded forms of the key. For NOTA's threat model (preventing accidental leakage), this is sufficient.

## Device Identity

The mobile app generates a random `device_id` on first launch and persists it via `AsyncStorage`. This identifier is:
- An **abuse-control signal**, NOT an authentication credential
- Sent as the `x-device-id` HTTP header with every request
- Used by the server to enforce daily scan quotas

### Limitations of device_id
- Can be reset by clearing app data or reinstalling
- Can be spoofed by a motivated attacker
- Does not uniquely identify a person

This is acceptable because `device_id` is layered with IP-based rate limiting. Both must be circumvented simultaneously to abuse the API.

## Rate Limiting

| Limit | Window | Scope | Rationale |
|-------|--------|-------|-----------|
| 20 requests | 15 minutes | Per IP | Prevents automated scripting from a single origin. A normal user scans 1-3 receipts per session. 20/15min provides generous headroom for demos and testing while blocking abuse. |
| 50 requests | 24 hours | Per device_id | Prevents sustained abuse from a single device. 50 scans/day far exceeds normal usage (estimated 3-5 scans/day for an active user). |

### Trade-offs
- **False positives**: A shared Wi-Fi (office, café) could cause multiple users to share an IP rate limit. At 20/15min, this is unlikely to cause friction in practice.
- **Determined attacker**: Could rotate IPs and reset device_id. Full mitigation would require user authentication, which conflicts with the frictionless UX goal.

## Payload Protection

- **Request body limit**: 2MB (Express `json({ limit: '2mb' })`)
- **Rationale**: A 1024px JPEG at 70% compression produces ~100-200KB of base64. 2MB provides 10x headroom for edge cases (high-detail receipts, different compression) while preventing memory exhaustion from malicious payloads.

## What NOTA Does NOT Claim

- NOTA does not claim to be "completely secure" — no system without authentication can be.
- NOTA does not claim device_id is authentication — it is explicitly an abuse signal.
- The rate limits are designed for the current portfolio/demo scale, not for production traffic of thousands of concurrent users.
