import Groq from 'groq-sdk';
import { ParsedTransactionPayload } from '../types';

function inferType(transcript: string): 'CREDIT' | 'DEBIT' {
  const normalized = transcript.toLowerCase();

  if (
    normalized.includes('received') ||
    normalized.includes('credit') ||
    normalized.includes('aaya') ||
    normalized.includes('jama')
  ) {
    return 'CREDIT';
  }

  return 'DEBIT';
}

function inferAmount(transcript: string): number {
  const match = transcript.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function inferName(transcript: string): string {
  const sanitized = transcript.replace(/\d+(?:\.\d+)?/g, '').trim();
  return sanitized.split(/\s+/).slice(0, 2).join(' ') || 'Unknown';
}

export function fallbackParseTranscript(transcript: string): ParsedTransactionPayload {
  return {
    name: inferName(transcript),
    amount: inferAmount(transcript),
    type: inferType(transcript),
    reason: transcript.trim(),
  };
}

export async function parseTranscriptWithGroq(
  transcript: string,
): Promise<ParsedTransactionPayload> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return fallbackParseTranscript(transcript);
  }

  console.log('[Groq Service] Sending to Groq:', transcript);
  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an expert shopkeeper's assistant (Himee). Your task is to interpret messy voice transcripts (Hindi/English/Hinglish) and convert them into ledger entries.
        
        SMART INTERPRETATION RULES:
        1. CORRECT ERRORS: Speech recognition often makes mistakes. Correct them based on context:
           - "ruby/rupy/rupe" -> "rupee" (amount)
           - "jam/jamma/jammu" -> "jama" (CREDIT)
           - "udhar/udari/udara" -> "udhaar" (DEBIT)
           - "bar key/baaki/baki" -> "baaki" (DEBIT)
           - "minus/ghatao/kam" -> DEBIT
           - "plus/jodo/dalo" -> CREDIT
        2. TRANSLITERATE NAMES: Convert Hindi names to English (e.g., "राहुल" -> "Rahul", "संदीप" -> "Sandeep").
        3. EXTRACT:
           - name: The person's name (transliterated to English).
           - amount: The numeric value (interpret "pachaas" as 50, "sau" as 100, etc.).
           - type: CREDIT (if money is added/jama/received) or DEBIT (if money is owed/udhaar/given/baaki).
           - reason: A short clean summary of what happened.
           
        Return ONLY a JSON object: {"name": string, "amount": number, "type": "CREDIT"|"DEBIT", "reason": string}`,
      },
      {
        role: 'user',
        content: transcript,
      },
    ],
  });

  console.log('[Groq Service] Received raw response');

  const message = completion.choices[0]?.message?.content;

  if (!message) {
    throw new Error('Groq returned an empty response');
  }

  const parsed = JSON.parse(message) as ParsedTransactionPayload;

  const rawType = String(parsed.type).toUpperCase();
  const normalizedType = rawType.includes('DEBIT') || rawType.includes('UDHAAR') ? 'DEBIT' : 'CREDIT';

  return {
    name: parsed.name || 'Unknown Customer',
    amount: Number(parsed.amount) || 0,
    type: normalizedType as 'CREDIT' | 'DEBIT',
    reason: parsed.reason || '',
  };
}
