require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const crypto = require('crypto');
const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  methods: ['POST'],
  allowedHeaders: ['Content-Type', 'x-device-id'],
}));
app.use(express.json({ limit: '2mb' }));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// A pinned, GA model keeps demo behavior reproducible. Set GEMINI_MODEL to override it.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const UPSTREAM_TIMEOUT_MS = 60_000;

const DOCUMENT_EXTRACTION_PROMPT = `
Read this Indonesian spending document and return only JSON matching the provided schema.

First set sourceType to exactly one of: receipt, bank_transfer, ewallet, qris. If unsure, use receipt.

For a physical receipt or digital invoice (e-commerce, food delivery), identify the merchant and every purchased good/service. Treat shipping fees, delivery fees, ongkos kirim, biaya layanan, and biaya jasa aplikasi as purchased items. Each item needs its original name, whole-number quantity (default 1), unitPrice when visible, and lineTotal. Do not include subtotal, tax, service, discount, or change as items. For per-unit rates (for example fuel), set quantity to 1 and use the stated total as lineTotal.

For a bank transfer, e-wallet, or QRIS proof, return exactly one item: use the transfer note as its name, or "Transfer" if no note exists. Its quantity is 1 and its lineTotal/unitPrice is the transferred amount.

For every document, extract purchaseDate as YYYY-MM-DD only when confidently visible. Do not invent a date. Extract receiptTotal as the printed grand total amount (the final amount paid). All monetary values must be numbers without currency symbols or separators.

CRITICAL MATH VALIDATION:
Before returning the JSON, you MUST mentally verify this exact mathematical equation:
(Sum of all item lineTotals) + tax + serviceCharge - discount == receiptTotal

If this equation is NOT true, your extraction is WRONG. Pay extreme attention to these Indonesian receipt conventions:
1. TAX INCLUSIVE (Termasuk PPN): If the item prices already include tax (e.g. Super Indo prints "Sub Total (Termasuk PPN)" and a PPN breakdown at the bottom), you MUST set tax: 0. Only set tax > 0 if it is EXPLICITLY ADDED to the subtotal to reach the receiptTotal.
2. If sum(items) - discount == receiptTotal, then tax and serviceCharge MUST be 0. Do not extract informational tax numbers at the bottom of the receipt if they break the equation.
3. ITEM-LEVEL VS GLOBAL DISCOUNTS: If a receipt shows discounts under specific items AND a 'Total Discount' at the bottom, DO NOT double-count them. Choose ONE method: EITHER subtract discounts from individual item lineTotals and set global discount: 0, OR keep item lineTotals at their original price and put the sum in global discount. The final equation MUST balance.
`.trim();

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sourceType: { type: 'STRING', enum: ['receipt', 'bank_transfer', 'ewallet', 'qris'] },
    merchantName: { type: 'STRING' },
    purchaseDate: { type: 'STRING' },
    receiptTotal: { type: 'NUMBER' },
    tax: { type: 'NUMBER' },
    serviceCharge: { type: 'NUMBER' },
    discount: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          lineTotal: { type: 'NUMBER' },
          unitPrice: { type: 'NUMBER' },
          quantity: { type: 'INTEGER' },
        },
        required: ['name', 'lineTotal', 'quantity'],
        propertyOrdering: ['name', 'quantity', 'unitPrice', 'lineTotal'],
      },
    },
  },
  required: ['sourceType', 'merchantName', 'purchaseDate', 'receiptTotal', 'tax', 'serviceCharge', 'discount', 'items'],
  propertyOrdering: ['sourceType', 'merchantName', 'purchaseDate', 'receiptTotal', 'tax', 'serviceCharge', 'discount', 'items'],
};

const deviceQuotas = new Map();
const DAILY_QUOTA = 50;

function deviceLogId(deviceId) {
  return crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 12);
}

function isValidBase64Image(value) {
  return typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function checkDeviceQuota(deviceId) {
  const dateKey = new Date().toISOString().split('T')[0];
  const key = `${deviceId}:${dateKey}`;
  const current = deviceQuotas.get(key) || 0;
  if (current >= DAILY_QUOTA) return false;
  deviceQuotas.set(key, current + 1);
  return true;
}

app.post('/api/extract', async (req, res) => {
  const reqId = Math.random().toString(36).substring(2, 9);
  const startTime = Date.now();
  const { base64Image } = req.body;
  const deviceId = req.headers['x-device-id'];

  console.log(JSON.stringify({
    level: 'info',
    reqId,
    event: 'extract_request',
    deviceId: typeof deviceId === 'string' ? deviceLogId(deviceId) : 'unknown',
    ip: req.ip,
    payloadSize: typeof base64Image === 'string' ? base64Image.length : 0,
  }));

  if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 128) {
    return res.status(401).json({ error: 'Missing device identifier' });
  }
  if (!isValidBase64Image(base64Image)) {
    return res.status(400).json({ error: 'base64Image must be a non-empty base64 string' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ level: 'error', reqId, event: 'missing_api_key' }));
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!checkDeviceQuota(deviceId)) {
    console.warn(JSON.stringify({ level: 'warn', reqId, event: 'quota_exceeded', deviceId: deviceLogId(deviceId) }));
    return res.status(429).json({ error: 'Daily scan limit reached for this device.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    console.log(`[INFO] Attempting document extraction with model: ${GEMINI_MODEL}`);
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64Image } }, { text: DOCUMENT_EXTRACTION_PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 200);
      console.error(JSON.stringify({ level: 'error', reqId, event: 'upstream_error', status: response.status, details }));
      return res.status(response.status).json({ error: `Gemini API Error (${response.status})` });
    }

    const extractionData = await response.json();
    const extractedText = extractionData?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(JSON.stringify({
      level: 'info',
      reqId,
      event: 'extract_success',
      durationMs: Date.now() - startTime,
      responseChars: typeof extractedText === 'string' ? extractedText.length : 0,
    }));
    return res.json(extractionData);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(JSON.stringify({ level: 'warn', reqId, event: 'upstream_timeout', model: GEMINI_MODEL }));
      return res.status(504).json({ error: 'Gemini request timed out. Please try again.' });
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({ level: 'error', reqId, event: 'unhandled_error', message }));
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    clearTimeout(timeout);
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`NOTA Proxy Server running on port ${port}`);
  });
}

module.exports = app;
