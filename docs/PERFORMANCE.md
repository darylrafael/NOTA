# NOTA — Performance Benchmark

## 1. Context
Sending full-resolution photos (often 5-10MB from modern smartphones) to a server is slow, wastes bandwidth, and consumes unnecessary memory in the upstream LLM API. NOTA compresses and resizes images on the client device before upload.

## 2. Hypothesis & Goal
* **Claim**: Resizing images on the client improves latency and reduces payload size without degrading OCR accuracy.
* **Goal**: Measure the exact impact of local image resizing using `sharp` (simulating Expo's client-side image manipulator).

## 3. Measurements: Image Pipeline (Payload Size)

A benchmark script (`scripts/benchmark-ai-advanced.js`) was run against local test assets.

| Configuration | Original PNG Size | JPEG (100%) | JPEG (70%) 1024px Max | Reduction |
| ------------- | ----------------- | ----------- | --------------------- | --------- |
| Receipt 1     | 760 KB            | ~760 KB     | 55.1 KB               | ~92%      |
| Receipt 2     | 188 KB            | ~188 KB     | 33.9 KB               | ~81%      |

**Evidence**: 
The downscaling to max 1024px combined with 0.7 JPEG compression reliably reduces image payload size by >80%. The client sends ~50KB payloads instead of multi-megabyte payloads.

**Decision**: 
The client-side `expo-image-manipulator` setting of `width: 1024, compress: 0.7` is preserved in V2 as it produces highly optimal payload sizes well below the BFF's 2MB limit.

## 4. Measurements: Latency

**UNVERIFIED CLAIM**: "Image compression reduces total extraction latency by 50%."

**Actual Measurement Status**: 
During automated benchmarking, the `gemini-2.5-flash` API endpoint returned `HTTP 429 Resource Exhausted` consistently due to strict Google AI Free Tier rate limits (15 RPM limits and daily limits). 

Because the upstream API refused the requests, we could not gather statistically significant end-to-end latency data comparing original payloads vs. compressed payloads.

**Conclusion**: 
While the payload size reduction is mathematically proven to save upload bandwidth, the end-to-end latency improvement remains **UNVERIFIED** under actual load until tested with a production Google Cloud API quota.

---

*This document adheres to the NOTA Portfolio Evidence Principle: No fabricated metrics.*
