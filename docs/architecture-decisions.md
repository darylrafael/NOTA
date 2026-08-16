# Architecture Decision Records (ADR)

## Decision 1: Backend-for-Frontend (BFF) Proxy
**Context:** NOTA V1 originally communicated directly with the Gemini API from the client.
**Problem:** The Gemini API key (`EXPO_PUBLIC_GEMINI_API_KEY`) was exposed in the client bundle. This is a critical security vulnerability that allows malicious actors to extract the key and generate unauthorized API charges.
**Options considered:** 
1. Keep direct client communication (Rejected: Insecure).
2. Set up a fully-fledged backend database and API (Rejected: Over-engineering, breaks the local-first ethos).
3. Set up a simple Backend-for-Frontend (BFF) Proxy.
**Evidence:** Official React Native and Google Cloud documentation explicitly warn against exposing API keys in mobile apps.
**Chosen option:** Option 3 (BFF Proxy).
**Why:** It secures the API key on the server while preserving the app's local-first architecture (data remains on SQLite).
**Trade-offs:** Adds infrastructure complexity (requires deploying a proxy).
**Risk:** If the proxy goes down, the AI feature breaks.

## Decision 2: Image Compression Pipeline
**Context:** V1 uploaded raw base64 images to Gemini.
**Problem:** High-resolution photos from modern phones are >5MB. Converting this to base64 crashes older phones due to memory limits, and uploading it takes >10 seconds on average connections.
**Options considered:**
1. Leave as is (Rejected).
2. Upload to Cloud Storage and pass URL to Gemini (Rejected: Requires cloud storage infra and auth).
3. Compress and resize locally before base64 encoding.
**Evidence:** OpenAI and Google Vision best practices state that 1024px is sufficient for OCR tasks.
**Chosen option:** Option 3.
**Why:** `expo-image-manipulator` can resize the image to a maximum of 1024px width and apply JPEG compression (0.7 quality). This shrinks payloads to ~150KB.
**Trade-offs:** Requires an extra processing step on the device before uploading.
**Risk:** Extreme compression might make some blurry receipts unreadable. (Mitigated by choosing a balanced 0.7 quality and 1024px dimension).
