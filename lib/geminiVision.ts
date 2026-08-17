import Constants from 'expo-constants';
import { GeminiExtractionResult } from '../types/receipt';
import { getDeviceId } from './device';
import { parseAndValidateExtraction } from './parseExtraction';

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
      throw err;
    }
    throw new GeminiVisionError(
      'Failed to connect to backend proxy. Check your internet connection or server status.',
      'network'
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new GeminiVisionError('Limit scan harian tercapai atau terlalu banyak request.', 'network');
    }
    if (response.status === 413) {
      throw new GeminiVisionError(
        'Ukuran gambar terlalu besar. Coba ambil foto dengan lebih sedikit area background.',
        'network'
      );
    }
    throw new GeminiVisionError(`Server error (${response.status}). Please try again.`, 'network');
  }

  const json = await response.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText || typeof rawText !== 'string') {
    throw new GeminiVisionError(
      'Gemini did not return a result. Try retaking the photo with better lighting.',
      'processing'
    );
  }

  try {
    return parseAndValidateExtraction(rawText);
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'MALFORMED_JSON' || code === 'UNEXPECTED_FORMAT') {
      throw new GeminiVisionError('Could not parse AI response. Please retake the photo.', 'processing');
    }
    if (code === 'NO_VALID_ITEMS') {
      throw new GeminiVisionError('No valid items could be read from this document.', 'processing');
    }
    throw new GeminiVisionError('Could not read this document. Please retake the photo.', 'processing');
  }
}
