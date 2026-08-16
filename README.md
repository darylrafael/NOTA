# NOTA — AI Receipt Scanner

NOTA is an AI-powered receipt scanner designed to quickly extract structured data (merchant, line items, prices, and taxes) from physical shopping receipts using computer vision and LLMs.

This project serves as a demonstration of **portfolio-grade product engineering**, focusing on local-first data storage, server-side credential isolation, observability, and robust UI/UX.

## 🚀 The Product

NOTA provides fast, local-first personal expense tracking with server-side protection for the AI integration. NOTA intentionally avoids mandatory account creation to minimize onboarding friction.

### Key Workflows
1. **Capture**: Take a photo or upload from the gallery.
2. **Process**: Image is downscaled locally and sent to the AI proxy.
3. **Extract**: Gemini extracts structured JSON.
4. **Validate**: Client validates data types and handles missing fields.
5. **Review & Edit**: User confirms or corrects items via the confirmation form.
6. **Save**: Persists to a local SQLite database.

## 🏗 Architecture

To protect the AI API key while maintaining a frictionless user experience (no login required), the architecture is split into a React Native client and a Node/Express Backend-For-Frontend (BFF).

```
┌────────────────────┐          ┌────────────────────┐          ┌────────────────────┐
│    Mobile App      │          │     BFF Proxy      │          │     Gemini API     │
│ (React Native)     │ ───────▶ │ (Node / Express)   │ ───────▶ │ (2.5 Flash Model)  │
│ - Image compression│  JSON    │ - Rate Limiting    │  JSON    │ - Vision OCR       │
│ - Local SQLite DB  │          │ - Device Quotas    │          │ - Structured JSON  │
│ - UI/UX            │ ◀─────── │ - API Key Secret   │ ◀─────── │                    │
└────────────────────┘          └────────────────────┘          └────────────────────┘
```

## 🔐 Security Model

Because the mobile client does not require user authentication, **the client is treated as completely untrusted**. 
1. **Zero Client Secrets**: The Gemini API key is *never* bundled in the mobile app. It exists exclusively on the proxy server.
2. **Abuse Prevention vs Auth**: We mitigate abuse via rate limiting. The app generates an anonymous `device_id` (an abuse-control signal, not a secure identity). The server enforces quotas per device (50 scans/day) and rate limits per IP (20 req / 15 mins).
3. **Payload Limits**: The proxy strictly drops requests over 2MB to prevent memory exhaustion attacks.

## ⚡ Performance Optimization

Sending full-resolution smartphone photos (5MB+) to an LLM over cellular networks is slow and wastes bandwidth. 
* **Client-Side Image Manipulation**: NOTA resizes images to a maximum width of 1024px with 0.7 JPEG compression *before* uploading. 
* **Result**: In the tested sample, image preprocessing reduced payload size from approximately 760KB to approximately 55KB, significantly reducing upload latency.

## 🧪 Testing & Observability

- **Structured Logging**: The BFF emits structured JSON logs (Request ID, IP, Device ID, Latency).
- **Integration Tests**: Tests verify the proxy server's boundaries (payload rejection, missing auth, rate limit triggers).
- **Security Audits**: The client build process includes an automated static production-bundle inspection script (`scripts/verify-bundle.js`) to verify that no API keys are leaked into the production bundle.

## 🛠 Engineering Decisions & Trade-offs

For a detailed log of why certain technologies were chosen over others, please read [docs/DECISIONS.md](./docs/DECISIONS.md).

## Getting Started

### 1. Start the Proxy Server
\`\`\`bash
cd server
npm install
npm run dev
\`\`\`
*Requires a `.env` file in the root directory with `GEMINI_API_KEY`.*

### 2. Start the Mobile App
\`\`\`bash
npm install
npx expo start
\`\`\`
*Ensure your phone and computer are on the same Wi-Fi network. Scan the QR code with Expo Go.*
