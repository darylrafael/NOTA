# NOTA Engineering Decisions

This document records significant architectural and engineering decisions made during the development of NOTA V2.

## 1. Security: Anonymous Abuse Prevention vs. Traditional Auth
* **Context**: NOTA is designed to be frictionless. Requiring user signup (e.g., Firebase Auth) before scanning the first receipt degrades the onboarding experience.
* **Problem**: The Gemini API key cannot be shipped in the client bundle without risking extraction and abuse.
* **Decision**: Implement a Backend-for-Frontend (BFF) proxy to hide the API key, combined with an **Abuse Prevention Model** on the client.
* **Implementation**: The server implements strict rate limiting (IP-based, 20 req/15min) and the mobile client generates a persistent `device_id` stored in `AsyncStorage`. The server limits each device to a daily quota (50 scans/day).
* **Trade-off**: `device_id` is an anonymous abuse-control signal, not secure authentication (it can be cleared by reinstalling the app). However, combined with IP rate-limiting, it raises the difficulty of automated abuse, which is designed to mitigate the most common attack vectors.

## 2. Image Pipeline: Payload Size vs. OCR Accuracy
* **Context**: Modern phone cameras produce images > 5MB. Sending 5MB JSON payloads to a proxy server and then to Gemini wastes bandwidth.
* **Problem**: Too much compression destroys receipt text legibility.
* **Decision**: Resize images on the client before upload.
* **Implementation**: We use `expo-image-manipulator` to resize images to a maximum width of 1024px with JPEG 0.7 compression. In the tested sample, this reduced a 760KB image to ~55KB.
* **Trade-off**: The payload reduction is mathematically proven to save upload bandwidth, while the end-to-end latency improvement remains unverified under actual load until tested with a production Google Cloud API quota.

## 3. Reliability: Fetch Abort Handling
* **Context**: AI processing can take several seconds.
* **Problem**: If the user navigates away from the scan screen during processing, the `fetch` promise will eventually resolve, attempting to update unmounted component state, causing memory leaks and React warnings.
* **Decision**: Tie network lifecycle to component lifecycle.
* **Implementation**: Passed an `AbortSignal` from a `useRef<AbortController>` inside a `useEffect` cleanup function.
* **Trade-off**: Requires slightly more boilerplate, but guarantees safe cleanup.

## 4. AI Model Selection
* **Context**: Google offers `gemini-1.5-pro`, `gemini-1.5-flash`, and `gemini-2.5-flash`.
* **Decision**: Use `gemini-2.5-flash`.
* **Why**: For NOTA's current receipt-extraction workflow, the expected benefit of lower latency and cost was prioritized over the additional reasoning capability of higher-tier models. `2.5-flash` provides structured JSON output enforcement (`responseSchema`).

## 5. UI Empty State Protection
* **Problem**: SQLite crashes or shows invalid UI if a receipt has 0 items.
* **Decision**: Prevent the user from deleting the last item in the confirmation screen. Force them to edit it instead.
* **Why**: Simplifies database logic and guarantees data integrity at the UX layer.
