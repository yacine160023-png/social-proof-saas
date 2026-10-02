import { openai } from '../config.js';

export interface ProcessedReview {
  shortQuote: string;
  caption: string;
}

export async function processReviewText(rawReview: string, author: string): Promise<ProcessedReview> {
  const prompt = `
Avis client de ${author}: "${rawReview}"

1. Extrais une citation percutante de 10 à 15 mots maximum.
2. Rédige une courte légende pour Instagram/LinkedIn avec 3 à 5 hashtags.

Réponds STRICTEMENT au format JSON :
{
  "shortQuote": "la citation",
  "caption": "la légende avec hashtags"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response');

  const parsed = JSON.parse(content) as Partial<ProcessedReview>;
  if (!parsed.shortQuote || !parsed.caption) {
    throw new Error('OpenAI returned invalid review content');
  }

  return { shortQuote: parsed.shortQuote, caption: parsed.caption };
}
