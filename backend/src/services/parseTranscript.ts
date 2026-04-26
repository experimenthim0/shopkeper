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
        content:
          'Extract a shopkeeper ledger entry from the transcript. ' +
          'Return ONLY a JSON object with these exact keys: ' +
          'name (string), amount (number), type (CREDIT if money in/jama, DEBIT if money out/udhaar), and reason (string). ' +
          'If name is missing, use "Unknown Customer". If amount is missing, use 0.',
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

  return {
    name: parsed.name,
    amount: Number(parsed.amount),
    type: parsed.type,
    reason: parsed.reason,
  };
}
