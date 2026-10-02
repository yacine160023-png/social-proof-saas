import axios from 'axios';
import { config } from '../config.js';

interface BannerbearImageResponse {
  image_url?: string;
  status?: string;
  uid?: string;
}

export async function generateSocialImage(
  quote: string,
  authorName: string,
  rating: number
): Promise<string> {
  const response = await axios.post<BannerbearImageResponse>(
    'https://api.bannerbear.com/v2/images',
    {
      template: config.bannerbearTemplateId,
      modifications: [
        { name: 'review_text', text: `"${quote}"` },
        { name: 'author_name', text: authorName },
        { name: 'rating_stars', text: '★'.repeat(Math.max(0, Math.min(5, rating))) }
      ]
    },
    {
      headers: { Authorization: `Bearer ${config.bannerbearApiKey}` }
    }
  );

  if (!response.data.image_url) {
    throw new Error(`Bannerbear did not return image_url (status: ${response.data.status ?? 'unknown'})`);
  }

  return response.data.image_url;
}
