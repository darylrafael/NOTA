import Constants from 'expo-constants';
import { ParsedReceiptItem, GeminiExtractionResult } from '../types/receipt';
import { getDeviceId } from './device';

// Resolve proxy URL dynamically for physical Android devices testing on LAN
function getProxyUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:3000/api/extract`;
  }
  return 'http://localhost:3000/api/extract';
}

const API_URL = getProxyUrl();

export type GeminiVisionErrorKind = 'network' | 'processing';

export class GeminiVisionError extends Error {
  kind: GeminiVisionErrorKind;
  constructor(message: string, kind: GeminiVisionErrorKind = 'processing') {
    super(message);
    this.name = 'GeminiVisionError';
    this.kind = kind;
  }
}

export async function extractDocument(base64Image: string, signal?: AbortSignal): Promise<GeminiExtractionResult> {
  let response: Response;
  const deviceId = await getDeviceId();

  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      signal,
      body: JSON.stringify({ base64Image }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GeminiVisionError('Request cancelled.', 'network');
    }
    console.warn('Proxy API Error caught in fetch:', err);
    throw new GeminiVisionError('Failed to connect to backend proxy. Check your internet connection or server status.', 'network');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'no body');
    console.warn(`Proxy API error (${response.status}):`, errorText);
    
    if (response.status === 429) {
      throw new GeminiVisionError('Limit scan harian tercapai atau terlalu banyak request.', 'network');
    }
    if (response.status === 413) {
      throw new GeminiVisionError('Ukuran gambar terlalu besar. Coba ambil foto dengan lebih sedikit area background.', 'network');
    }
    
    throw new GeminiVisionError(`Server error (${response.status}). Please try again.`, 'network');
  }

  const json = await response.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new GeminiVisionError('Gemini did not return a result. Try retaking the photo with better lighting.', 'processing');
  }

  return parseAndValidate(rawText);
}

function parseAndValidate(rawText: string): GeminiExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new GeminiVisionError("Could not parse AI response. Please retake the photo.", 'processing');
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as any).items)) {
    throw new GeminiVisionError('Unexpected response format from AI. Please retake the photo.', 'processing');
  }

  const rawMerchantName = (parsed as any).merchantName;
  const merchantName = typeof rawMerchantName === 'string' ? rawMerchantName.trim() : '';
  
  const rawSourceType = (parsed as any).sourceType;
  const sourceType = typeof rawSourceType === 'string' && ['receipt', 'bank_transfer', 'ewallet', 'qris'].includes(rawSourceType) ? rawSourceType : 'receipt';

  const items: ParsedReceiptItem[] = [];
  let hadParsingIssues = false;

  for (const raw of (parsed as any).items) {
    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    const price = Number(raw?.price);
    const quantity = Number(raw?.quantity);

    const isValid = name.length > 0 && !Number.isNaN(price) && Number.isFinite(price) && price >= 0;

    if (!isValid) {
      hadParsingIssues = true;
      continue;
    }

    items.push({
      name,
      price,
      quantity: (!Number.isNaN(quantity) && Number.isFinite(quantity) && quantity > 0) ? Math.round(quantity) : 1,
    });
  }

  if (items.length === 0) {
    throw new GeminiVisionError('No valid items could be read from this document.', 'processing');
  }

  const receiptTotal = Number((parsed as any).receiptTotal);
  const safeReceiptTotal = (!Number.isNaN(receiptTotal) && Number.isFinite(receiptTotal)) ? receiptTotal : 0;
  
  const tax = Number((parsed as any).tax);
  const safeTax = (!Number.isNaN(tax) && Number.isFinite(tax)) ? tax : 0;
  
  const serviceCharge = Number((parsed as any).serviceCharge);
  const safeServiceCharge = (!Number.isNaN(serviceCharge) && Number.isFinite(serviceCharge)) ? serviceCharge : 0;

  return { 
    items, 
    hadParsingIssues, 
    merchantName, 
    receiptTotal: safeReceiptTotal, 
    tax: safeTax, 
    serviceCharge: safeServiceCharge,
    sourceType: sourceType as any // TypeScript will infer SourceType from the return type
  };
}
