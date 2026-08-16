# NOTA — AI Evaluation Strategy

## 1. Context
NOTA requires a vision-language model capable of reading noisy, low-light, and crumpled physical receipts and returning highly structured JSON output. 

## 2. Model Selection: Gemini 2.5 Flash
For V2, the application utilizes **Gemini 2.5 Flash** (`gemini-2.5-flash`).

### Why 2.5 Flash instead of 2.5 Pro?
Receipt extraction relies heavily on OCR and basic semantic mapping, which is a low-reasoning task. Using a "Pro" class model would increase latency and token cost without significantly improving accuracy for simple line-item extraction.

### Verification of Capabilities
- **Vision Support**: Verified. Gemini 2.5 Flash supports `image/jpeg` inline data.
- **Structured JSON Support**: Verified. The model strictly adheres to the `responseSchema` JSON schema passed in the `generationConfig`.

## 3. Extraction Accuracy Measurement

**Status**: ⚠️ **UNVERIFIED / BLOCKED**

A preliminary automated evaluation script (`scripts/benchmark-ai-advanced.js`) was configured to test the model against a small test dataset of Indonesian receipts.

**Metrics Intended for Measurement**:
- Merchant Name extraction
- Line item total price vs unit price distinction
- Tax/Service Charge isolation

**Current Obstacle**:
During the evaluation phase, the Google AI Studio API returned persistent `HTTP 429 Resource Exhausted` errors. The free-tier API quotas (15 requests per minute, and daily limits) were exhausted.

### Mitigation in the Application
Because LLM outputs cannot be trusted (and accuracy is currently empirically unverified for 2.5 Flash on this dataset), the NOTA architecture explicitly defends against AI hallucinations:

1. **Client-side Semantic Validation**: `lib/geminiVision.ts` implements strict boundary checking (NaN detection, negative value prevention, required string lengths).
2. **Database Integrity**: The SQLite `insert` functions enforce NOT NULL constraints.
3. **UX Fallback**: The Confirmation Screen allows the user to manually correct any hallucinatory values before they ever reach the local database.

---
*This document adheres to the NOTA Portfolio Evidence Principle: No fabricated metrics.*
