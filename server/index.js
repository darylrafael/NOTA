require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
// Reduce payload limit from 10mb to 2mb (more than enough for 1024px compressed JPEG)
app.use(express.json({ limit: '2mb' }));

// 1. IP-based Rate Limiting (Abuse Prevention)
// Limits each IP to 20 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// Model is configured server-side only. Client never knows which model is used.
// This allows model upgrades without requiring a mobile release.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// We keep the prompt and schema here to ensure the client can't tamper with them
const RECEIPT_EXTRACTION_PROMPT = `
You are reading a photo of a shopping or dining receipt from Indonesia.

First, identify the store or merchant name printed on the receipt (usually near the top — business name, cafe name, restaurant name, minimarket name, etc). If you cannot confidently identify one, return an empty string for merchantName. Do not guess.

Then extract every purchased item listed on this receipt. For each item, provide:
- name: item name (string, exactly as written on the receipt — do NOT translate item names)
- price: TOTAL price for this line item (unit price multiplied by quantity), NUMBER ONLY, no thousand separators, no currency symbol. This is NOT the unit price.
- quantity: item quantity, assume 1 if not shown. This must ALWAYS be a whole number.

Example: if the receipt shows "2 x 12,000 = 24,000", then price = 24000 (the line total), NOT 12000 (the unit price). Indonesian receipts usually show this multiplied result in the rightmost column — use that number for price.

SPECIAL CASE — per-unit rate receipts (e.g. fuel/gas station receipts): some receipts show a rate per unit (like "Harga/Liter") together with a decimal volume (like "Volume: (L) 27.77") instead of a whole-number item count. In this case:
- Do NOT put the decimal volume into quantity — quantity must always be a whole number.
- Treat quantity as 1.
- Use the receipt's stated total ("Total Harga" or similar grand total line) as price.

IMPORTANT about numbers: receipts are sometimes blurry or poorly printed, which can cause digits to be misread. If a price for a typical everyday item comes out above 10,000,000, it is LIKELY a misread — double-check the digits before answering.

TAX & SERVICE CHARGE EXTRACTION:
- Extract the tax amount (often labeled as "Pajak", "PB1", "PB 1", "PPN", "Tax", "VAT", or percentage like "PB1 10%") as a number. Return 0 if not present.
- Extract the service charge amount (often labeled as "Service", "Service Charge", "SC", "Biaya Layanan", "Gratuity", or percentage like "Service 5%") as a number. Return 0 if not present.
- Extract receiptTotal (the final Grand Total / Total Bayar / Total Akhir after taxes and services).
- Do NOT include subtotal, total, tax, service charge, or change rows inside the items array — only purchased food/goods. Put tax, service charge, and receipt total in their respective top-level fields.
`.trim();

const RECEIPT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchantName: { type: 'STRING' },
    receiptTotal: { type: 'NUMBER' },
    tax: { type: 'NUMBER' },
    serviceCharge: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          price: { type: 'NUMBER' },
          quantity: { type: 'INTEGER' },
        },
        required: ['name', 'price', 'quantity'],
        propertyOrdering: ['name', 'price', 'quantity'],
      },
    },
  },
  required: ['merchantName', 'receiptTotal', 'tax', 'serviceCharge', 'items'],
  propertyOrdering: ['merchantName', 'receiptTotal', 'tax', 'serviceCharge', 'items'],
};

const DOCUMENT_CLASSIFIER_PROMPT = `
You are analyzing an image of a document. Classify the document into one of the following types:
- 'receipt': A shopping/dining physical receipt with a list of purchased items, prices, and a total.
- 'bank_transfer': A screenshot or photo of a bank transfer receipt (e.g. BCA, Mandiri, BRI).
- 'ewallet': A screenshot or photo of an e-wallet payment receipt (e.g. GoPay, OVO, Dana, ShopeePay).
- 'qris': A screenshot or photo of a QRIS payment receipt.

If you are unsure, default to 'receipt'.
`.trim();

const CLASSIFIER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    documentType: { type: 'STRING', enum: ['receipt', 'bank_transfer', 'ewallet', 'qris'] }
  },
  required: ['documentType']
};

const TRANSFER_EXTRACTION_PROMPT = `
You are reading a screenshot or photo of a digital payment proof (bank transfer, e-wallet, or QRIS) from Indonesia.

Extract the following information:
- merchantName: The name of the recipient (person, merchant, or company). If not found, return empty string.
- receiptTotal: The total amount paid/transferred. NUMBER ONLY, no thousand separators.
- tax: Any admin fee or transaction fee (Biaya Admin/Biaya Transaksi). NUMBER ONLY. Return 0 if not present.
- serviceCharge: Always return 0 for digital transfers.
- items: An array containing EXACTLY ONE item representing this transfer.
  - name: The description or note of the transfer (e.g. "Bayar kos", "Uang makan"). If no note is present, use a generic name like "Transfer to [Recipient Name]" or just "Transfer".
  - price: The nominal amount of the transfer (excluding admin fee). NUMBER ONLY.
  - quantity: Always 1.

Example: A BCA transfer to "Budi" for Rp 50,000 with admin fee Rp 2,500 and note "Uang patungan".
merchantName: "Budi"
receiptTotal: 52500
tax: 2500
serviceCharge: 0
items: [{ name: "Uang patungan", price: 50000, quantity: 1 }]
`.trim();

const TRANSFER_RESPONSE_SCHEMA = RECEIPT_RESPONSE_SCHEMA; // the schema is identical for both

// 2. Simple In-Memory Device Quota (Production apps should use Redis)
const deviceQuotas = new Map();
const DAILY_QUOTA = 50;

function checkDeviceQuota(deviceId) {
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `${deviceId}:${dateKey}`;
  
  const current = deviceQuotas.get(key) || 0;
  if (current >= DAILY_QUOTA) {
    return false;
  }
  deviceQuotas.set(key, current + 1);
  return true;
}

app.post('/api/extract', async (req, res) => {
  const reqId = Math.random().toString(36).substring(2, 9);
  const startTime = Date.now();
  
  try {
    const { base64Image } = req.body;
    const deviceId = req.headers['x-device-id'];
    
    // Structured Logging
    console.log(JSON.stringify({
      level: 'info',
      reqId,
      event: 'extract_request',
      deviceId: deviceId || 'unknown',
      ip: req.ip,
      payloadSize: base64Image ? base64Image.length : 0
    }));

    if (!base64Image) {
      return res.status(400).json({ error: 'base64Image is required' });
    }
    
    if (!deviceId) {
      return res.status(401).json({ error: 'Missing device identifier' });
    }
    
    if (!checkDeviceQuota(deviceId)) {
      console.warn(JSON.stringify({ level: 'warn', reqId, event: 'quota_exceeded', deviceId }));
      return res.status(429).json({ error: 'Daily scan limit reached for this device.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error(JSON.stringify({ level: 'error', reqId, event: 'missing_api_key' }));
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // 3. Upstream Call with Verified Working Models on 503/429
    const MODELS_TO_TRY = [
      'gemini-flash-latest',
      'gemini-3.5-flash',
      GEMINI_MODEL,
      'gemini-3.7-flash',
    ];
    let lastErrorText = '';
    let lastStatus = 500;
    let classificationData = null;
    let extractionData = null;
    let documentType = 'receipt';

    // Step 1: Classify the document
    for (const model of MODELS_TO_TRY) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        console.log(`[INFO] Attempting classification with model: ${model}`);
        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64Image } }, { text: DOCUMENT_CLASSIFIER_PROMPT }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: CLASSIFIER_RESPONSE_SCHEMA },
          }),
        });

        clearTimeout(timeout);

        if (response.ok) {
          classificationData = await response.json();
          break; // Success!
        }

        lastStatus = response.status;
        lastErrorText = await response.text();
        console.warn(`[WARN] Model ${model} classification failed with status ${response.status}: ${lastErrorText}`);
        if (response.status === 400) break;
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          console.warn(JSON.stringify({ level: 'warn', reqId, event: 'upstream_timeout_classify', model }));
          lastStatus = 504;
          lastErrorText = 'Upstream AI service timed out';
        } else {
          lastErrorText = fetchError.message;
        }
      }
    }

    if (classificationData) {
       try {
         const rawText = classificationData?.candidates?.[0]?.content?.parts?.[0]?.text;
         if (rawText) {
           const parsed = JSON.parse(rawText);
           documentType = parsed.documentType || 'receipt';
         }
       } catch (e) {
         console.warn("[WARN] Failed to parse classification result, defaulting to 'receipt'");
       }
    }
    
    console.log(JSON.stringify({ level: 'info', reqId, event: 'classification_result', documentType }));
    
    // Select the appropriate prompt
    const isTransfer = ['bank_transfer', 'ewallet', 'qris'].includes(documentType);
    const extractionPrompt = isTransfer ? TRANSFER_EXTRACTION_PROMPT : RECEIPT_EXTRACTION_PROMPT;
    const extractionSchema = isTransfer ? TRANSFER_RESPONSE_SCHEMA : RECEIPT_RESPONSE_SCHEMA;

    // Step 2: Extract details based on classification
    for (const model of MODELS_TO_TRY) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      try {
        console.log(`[INFO] Attempting extraction with model: ${model}`);
        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64Image } }, { text: extractionPrompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: extractionSchema },
          }),
        });

        clearTimeout(timeout);

        if (response.ok) {
          extractionData = await response.json();
          break; // Success!
        }

        lastStatus = response.status;
        lastErrorText = await response.text();
        console.warn(`[WARN] Model ${model} extraction failed with status ${response.status}: ${lastErrorText}`);

        // If it's not a quota/server overload error, don't retry (e.g. 400 Bad Request)
        if (response.status === 400) {
          break;
        }
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          console.warn(JSON.stringify({ level: 'warn', reqId, event: 'upstream_timeout', model }));
          lastStatus = 504;
          lastErrorText = 'Upstream AI service timed out';
        } else {
          lastErrorText = fetchError.message;
        }
      }
    }

    if (!extractionData) {
      console.error(JSON.stringify({ level: 'error', reqId, event: 'upstream_error', status: lastStatus, details: lastErrorText }));
      return res.status(lastStatus).json({ error: `Gemini API Error (${lastStatus})` });
    }
    const duration = Date.now() - startTime;
    
    console.log('[DEBUG GEMINI RAW OUTPUT]:', extractionData?.candidates?.[0]?.content?.parts?.[0]?.text);
    console.log(JSON.stringify({ level: 'info', reqId, event: 'extract_success', durationMs: duration }));
    
    // Inject sourceType into the response payload so the client knows how to handle it
    let finalJsonResponse = extractionData;
    try {
      const rawText = finalJsonResponse.candidates[0].content.parts[0].text;
      const parsedData = JSON.parse(rawText);
      parsedData.sourceType = documentType;
      finalJsonResponse.candidates[0].content.parts[0].text = JSON.stringify(parsedData);
    } catch(e) {
      console.warn("[WARN] Could not inject sourceType into extraction result", e);
    }
    
    return res.json(finalJsonResponse);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', reqId, event: 'unhandled_error', message: error.message }));
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`NOTA Proxy Server running on port ${PORT}`);
  });
}

module.exports = app;
