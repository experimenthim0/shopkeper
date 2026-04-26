import Groq from 'groq-sdk';
import { ParsedTransactionPayload } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// 1. SPEECH CORRECTION MAP
//    Vosk (offline) and even online recognizers garble Hindi words.
//    This map fixes the most common mishearings BEFORE sending to the LLM.
// ──────────────────────────────────────────────────────────────────────────────

const SPEECH_CORRECTIONS: Record<string, string> = {
  // Amount words
  'ruby': 'rupee', 'rupy': 'rupee', 'rupe': 'rupee', 'rupay': 'rupee',
  'rupaye': 'rupee', 'rupees': 'rupee', 'rupiya': 'rupee', 'rupias': 'rupee',
  'ruppee': 'rupee', 'ruppees': 'rupee',

  // Hindi numbers commonly misheard
  'das': '10', 'bis': '20', 'tees': '30', 'chalees': '40', 'chalis': '40',
  'pachaas': '50', 'pachis': '25', 'pachas': '50', 'saath': '60', 'sattar': '70',
  'assi': '80', 'nabbe': '90', 'sau': '100', 'so': '100',
  'do sau': '200', 'teen sau': '300', 'chaar sau': '400', 'paanch sau': '500',
  'hazaar': '1000', 'hazar': '1000', 'hajaar': '1000', 'hajar': '1000',
  'ek hazaar': '1000', 'do hazaar': '2000', 'teen hazaar': '3000',
  'paanch hazaar': '5000', 'das hazaar': '10000',
  'lakh': '100000', 'laakh': '100000',
  'dedh sau': '150', 'dhai sau': '250', 'dedh hazaar': '1500', 'dhai hazaar': '2500',
  'saadhe teen sau': '350', 'saadhe chaar sau': '450', 'saadhe paanch sau': '550',

  // Credit keywords – common mishearings
  'jam': 'jama', 'jamma': 'jama', 'jammu': 'jama', 'jamah': 'jama',
  'gamma': 'jama', 'drama': 'jama', 'jamal': 'jama',
  'aaye': 'aaya', 'ai': 'aaya', 'aye': 'aaya', 'eye': 'aaya',
  'mill gaya': 'mil gaya', 'mil gaye': 'mil gaya', 'milgaya': 'mil gaya',
  'kat lo': 'kaat lo', 'katlo': 'kaat lo', 'cut low': 'kaat lo',
  'come karo': 'kam karo', 'cumcaro': 'kam karo',
  'paid': 'received', 'pay kiya': 'received',
  'wapas': 'received', 'wapas aaya': 'received', 'laut aaya': 'received',
  'de diya': 'received', 'diya': 'received',
  'jodo': 'add', 'jor do': 'add', 'add karo': 'add',
  'dalo': 'add', 'dal do': 'add',

  // Debit keywords – common mishearings
  'udhar': 'udhaar', 'udari': 'udhaar', 'udara': 'udhaar', 'udar': 'udhaar',
  'udahar': 'udhaar', 'oodhar': 'udhaar', 'udher': 'udhaar', 'oodaar': 'udhaar',
  'udhaar': 'udhaar',
  'bar key': 'baaki', 'baki': 'baaki', 'barkey': 'baaki', 'backy': 'baaki',
  'bocky': 'baaki', 'barki': 'baaki', 'bar ki': 'baaki', 'baqi': 'baaki',
  'liko': 'likho', 'likhdo': 'likho', 'lick o': 'likho', 'lick': 'likho',
  'charha do': 'chadha do', 'chadha': 'chadha do', 'chada do': 'chadha do',
  'khatey mein': 'khate mein', 'gate main': 'khate mein',
  'kharcha': 'spent', 'karcha': 'spent', 'karch': 'spent',
  'ghatao': 'minus', 'hatao': 'minus', 'nikalo': 'minus',
  'lena': 'udhaar', 'lena hai': 'udhaar', 'dena hai': 'udhaar',
  'liya': 'udhaar', 'le liya': 'udhaar',
  'nikaal lo': 'minus', 'nikal lo': 'minus',

  // Wake word cleanup
  'hi me': 'himee', 'himi': 'himee', 'hi mi': 'himee', 'he me': 'himee',
  'hemee': 'himee', 'himy': 'himee', 'him e': 'himee',
};

// Multi-word corrections (must be applied first, longest match wins)
const MULTI_WORD_CORRECTIONS: [RegExp, string][] = [
  [/\bdedh\s*sau\b/gi, '150'],
  [/\bdhai\s*sau\b/gi, '250'],
  [/\bdedh\s*haz[ae]r\b/gi, '1500'],
  [/\bdhai\s*haz[ae]r\b/gi, '2500'],
  [/\bek\s*haz[ae]r\b/gi, '1000'],
  [/\bdo\s*haz[ae]r\b/gi, '2000'],
  [/\bteen\s*haz[ae]r\b/gi, '3000'],
  [/\bchaar\s*haz[ae]r\b/gi, '4000'],
  [/\bpaanch\s*haz[ae]r\b/gi, '5000'],
  [/\bdas\s*haz[ae]r\b/gi, '10000'],
  [/\bdo\s*sau\b/gi, '200'],
  [/\bteen\s*sau\b/gi, '300'],
  [/\bchaar\s*sau\b/gi, '400'],
  [/\bpaanch\s*sau\b/gi, '500'],
  [/\bmil\s*gaya?\b/gi, 'mil gaya'],
  [/\bkaat\s*lo\b/gi, 'kaat lo'],
  [/\bkam\s*karo\b/gi, 'kam karo'],
  [/\bchadha\s*do\b/gi, 'chadha do'],
  [/\bkhate\s*mein\b/gi, 'khate mein'],
  [/\bde\s*diya\b/gi, 'received'],
  [/\ble\s*liya\b/gi, 'udhaar'],
  [/\bwapas\s*aaya?\b/gi, 'received'],
  [/\blaut\s*aaya?\b/gi, 'received'],
  [/\badd\s*karo\b/gi, 'add'],
  [/\bjor\s*do\b/gi, 'add'],
  [/\bdal\s*do\b/gi, 'add'],
  [/\bnikal?\s*lo\b/gi, 'minus'],
  [/\blena\s*hai\b/gi, 'udhaar'],
  [/\bdena\s*hai\b/gi, 'udhaar'],
  [/\bpay\s*kiya\b/gi, 'received'],
];

/**
 * Pre-process the raw transcript to fix common speech recognition errors.
 */
function preProcessTranscript(raw: string): string {
  let text = raw.trim();

  // 1. Apply multi-word corrections first (longest patterns)
  for (const [pattern, replacement] of MULTI_WORD_CORRECTIONS) {
    text = text.replace(pattern, replacement);
  }

  // 2. Apply single-word corrections
  const words = text.split(/\s+/);
  const corrected = words.map((word) => {
    const lower = word.toLowerCase();
    return SPEECH_CORRECTIONS[lower] || word;
  });

  return corrected.join(' ');
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. IMPROVED FALLBACK PARSER (no internet / no API key)
// ──────────────────────────────────────────────────────────────────────────────

const CREDIT_KEYWORDS = [
  'credit', 'received', 'deposit', 'plus', 'add',
  'jama', 'aaya', 'mil gaya', 'kaat lo', 'kam karo',
  'wapas', 'laut', 'jodo', 'dalo', 'credited',
];

const DEBIT_KEYWORDS = [
  'debit', 'spent', 'due', 'negative', 'minus', 'wrote',
  'udhaar', 'baaki', 'likho', 'chadha do', 'khate mein',
  'kharcha', 'ghatao', 'hatao', 'nikalo', 'lena', 'liya',
  'debited', 'udhar',
];

// Common Hindi first names to help identify names in text
const COMMON_NAMES = [
  'rahul', 'sandeep', 'amit', 'vijay', 'suresh', 'mahesh', 'rakesh', 'ramesh',
  'sanjay', 'deepak', 'anil', 'sunil', 'mohan', 'ravi', 'ajay', 'vishal',
  'nitin', 'rohit', 'gaurav', 'dinesh', 'mukesh', 'rajesh', 'pradeep',
  'manoj', 'ashok', 'gopal', 'kamal', 'krishna', 'arjun', 'shyam',
  'rita', 'sita', 'geeta', 'radha', 'sunita', 'anita', 'neha', 'pooja',
  'priya', 'meena', 'seema', 'rekha', 'lata', 'maya', 'asha',
  'khan', 'sharma', 'gupta', 'singh', 'kumar', 'yadav', 'verma', 'pandey',
  'chauhan', 'joshi', 'patel', 'mishra', 'tiwari', 'dubey', 'saxena',
];

// Words that are NOT names (transaction keywords, fillers, etc.)
const NON_NAME_WORDS = new Set([
  'rupee', 'rupees', 'rupaye', 'rs', 'paisa',
  ...CREDIT_KEYWORDS, ...DEBIT_KEYWORDS,
  'ka', 'ke', 'ki', 'ko', 'se', 'ne', 'me', 'mein', 'hai', 'hain',
  'the', 'a', 'an', 'is', 'was', 'for', 'and', 'or', 'of', 'to',
  'himee', 'him', 'hi',
  'karo', 'do', 'lo', 'de', 'le', 'bhai', 'sir', 'ji', 'sahab',
  'total', 'amount', 'money', 'paisa', 'balance',
]);

function inferType(text: string): 'CREDIT' | 'DEBIT' {
  const lower = text.toLowerCase();

  // Check for credit keywords first
  for (const keyword of CREDIT_KEYWORDS) {
    if (lower.includes(keyword)) return 'CREDIT';
  }

  // Check for debit keywords
  for (const keyword of DEBIT_KEYWORDS) {
    if (lower.includes(keyword)) return 'DEBIT';
  }

  // Default to DEBIT (udhaar is more common for shopkeepers)
  return 'DEBIT';
}

function inferAmount(text: string): number {
  // Try to find a plain number first
  const numberMatch = text.match(/(\d+(?:[.,]\d+)?)/);
  if (numberMatch) {
    return Number(numberMatch[1].replace(',', ''));
  }
  return 0;
}

function inferName(text: string): string {
  const words = text.split(/\s+/);

  // Strategy 1: Check against known common names
  for (const word of words) {
    if (COMMON_NAMES.includes(word.toLowerCase())) {
      return capitalize(word);
    }
  }

  // Strategy 2: Find a word that is NOT a number, NOT a keyword
  const candidates = words.filter((w) => {
    const lower = w.toLowerCase();
    return (
      !NON_NAME_WORDS.has(lower) &&
      !/^\d+$/.test(w) &&
      w.length > 1
    );
  });

  if (candidates.length > 0) {
    // Take at most 2 words as a name
    return candidates.slice(0, 2).map(capitalize).join(' ');
  }

  return 'Unknown';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function fallbackParseTranscript(transcript: string): ParsedTransactionPayload {
  const cleaned = preProcessTranscript(transcript);
  return {
    name: inferName(cleaned),
    amount: inferAmount(cleaned),
    type: inferType(cleaned),
    reason: transcript.trim(),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. GROQ AI PARSER (primary – online)
// ──────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are "Himee", an expert Indian shopkeeper's voice assistant. Your job is to extract structured ledger entries from messy, noisy voice transcripts spoken in Hindi, English, or Hinglish.

## YOUR CAPABILITIES
You are specifically trained to understand:
- Broken Hindi transliterated into English by a speech recognizer
- Mixed Hindi-English (Hinglish) sentences  
- Common shopkeeper slang and idioms
- Noisy, partial, or grammatically incorrect speech

## TRANSACTION TYPE RULES

### CREDIT (Jama / जमा) — Money COMING IN to the shop
Use CREDIT when the customer is PAYING the shopkeeper or REDUCING their debt:
- "jama", "jama karo", "jama kar do"
- "aaya", "paisa aaya", "mil gaya"
- "received", "deposit", "credited"
- "kaat lo", "kam karo" (reduce the debt)
- "wapas aaya", "laut aaya" (money returned)
- "de diya" (he gave), "pay kiya"
- "plus", "add", "jodo", "dalo"

### DEBIT (Udhaar / उधार) — Money GOING OUT or debt INCREASING
Use DEBIT when the customer is TAKING goods on credit or the debt is increasing:
- "udhaar", "udhar", "udhaar likho"
- "baaki", "baaki hai", "baaki rakh lo"
- "likho", "likh do" (write it down = debt)
- "chadha do", "khate mein daal do" (add to account = debt)
- "lena hai", "le liya" (took on credit)
- "minus", "ghatao", "nikalo"
- "kharcha", "spent", "due"

## HINDI NUMBER UNDERSTANDING
You MUST correctly interpret spoken Hindi numbers:
- das=10, bis=20, tees=30, chalees/chalis=40, pachaas/pachas=50
- saath=60, sattar=70, assi=80, nabbe=90, sau/so=100
- dedh sau=150, dhai sau=250, do sau=200, teen sau=300
- hazaar/hazar=1000, dedh hazaar=1500, dhai hazaar=2500
- lakh/laakh=100000

## NAME HANDLING
- ALWAYS transliterate Hindi names to English: "राहुल" → "Rahul", "संदीप" → "Sandeep"
- Capitalize properly: "rahul" → "Rahul"
- If name sounds like a known Indian name, correct the spelling
- If two words together sound like a name, combine them: "raam prasad" → "Ram Prasad"

## SPEECH ERROR CORRECTION
Voice recognizers often produce wrong words. Correct based on CONTEXT:
- "ruby/rupy/rupe" in money context → "rupee"
- "jam/jamma/gamma" in transaction context → "jama" (CREDIT)  
- "bar key/backy/baki" → "baaki" (DEBIT)
- "udari/udara/oodhar" → "udhaar" (DEBIT)
- "lick o/liko" → "likho" (write = DEBIT)
- Unknown words near a number → probably a name

## REASON EXTRACTION
Create a clean, short summary describing the transaction:
- "rahul ne 500 rupaye ka doodh liya" → reason: "doodh (milk)"
- "200 udhaar vegetables" → reason: "vegetables"
- If no clear reason, use a short cleaned version of the original text

## EXAMPLES

Input: "rahul ka 500 udhaar likho doodh ka"
Output: {"name": "Rahul", "amount": 500, "type": "DEBIT", "reason": "doodh (milk)"}

Input: "sandeep ne 200 jama kar diya"
Output: {"name": "Sandeep", "amount": 200, "type": "CREDIT", "reason": "payment received"}

Input: "vijay pachaas rupaye udhar"
Output: {"name": "Vijay", "amount": 50, "type": "DEBIT", "reason": "udhaar"}

Input: "teen sau aaya amit se"
Output: {"name": "Amit", "amount": 300, "type": "CREDIT", "reason": "payment received"}

Input: "ravi dhai sau baaki vegetables"
Output: {"name": "Ravi", "amount": 250, "type": "DEBIT", "reason": "vegetables"}

Input: "pooja ne dedh hazaar de diya last month ka"
Output: {"name": "Pooja", "amount": 1500, "type": "CREDIT", "reason": "last month ka payment"}

Return ONLY a valid JSON object with these exact keys: {"name": string, "amount": number, "type": "CREDIT"|"DEBIT", "reason": string}
Do NOT wrap in markdown. Do NOT add any explanation.`;

export async function parseTranscriptWithGroq(
  transcript: string,
): Promise<ParsedTransactionPayload> {
  const apiKey = process.env.GROQ_API_KEY;

  // Pre-process the transcript to fix common speech errors
  const correctedTranscript = preProcessTranscript(transcript);
  console.log('[Parse] Original:', transcript);
  console.log('[Parse] Corrected:', correctedTranscript);

  if (!apiKey) {
    console.log('[Parse] No GROQ_API_KEY, using fallback parser');
    return fallbackParseTranscript(transcript);
  }

  console.log('[Groq Service] Sending to Groq:', correctedTranscript);
  const groq = new Groq({ apiKey });

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Parse this shopkeeper voice transcript into a ledger entry:\n\n"${correctedTranscript}"\n\nOriginal (before correction): "${transcript}"`,
        },
      ],
    });

    console.log('[Groq Service] Received response');

    const message = completion.choices[0]?.message?.content;

    if (!message) {
      throw new Error('Groq returned an empty response');
    }

    const parsed = JSON.parse(message) as ParsedTransactionPayload;

    // Normalize the type field
    const rawType = String(parsed.type).toUpperCase();
    const normalizedType =
      rawType.includes('DEBIT') || rawType.includes('UDHAAR')
        ? 'DEBIT'
        : 'CREDIT';

    const result: ParsedTransactionPayload = {
      name: capitalize(parsed.name || 'Unknown Customer'),
      amount: Number(parsed.amount) || 0,
      type: normalizedType as 'CREDIT' | 'DEBIT',
      reason: parsed.reason || '',
    };

    console.log('[Groq Service] Parsed result:', result);
    return result;
  } catch (error) {
    console.error('[Groq Service] Error, falling back to local parser:', error);
    return fallbackParseTranscript(transcript);
  }
}
