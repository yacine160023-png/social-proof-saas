import axios from 'axios';

export async function publishToSocials(
  userAyrshareKey: string,
  imageUrl: string,
  caption: string,
  platforms: string[] = ['instagram', 'linkedin', 'facebook']
) {
  if (!userAyrshareKey) throw new Error('Missing Ayrshare API key for client');

  const response = await axios.post(
    'https://app.ayrshare.com/api/post',
    { post: caption, mediaUrls: [imageUrl], platforms },
    { headers: { Authorization: `Bearer ${userAyrshareKey}` } }
  );

  return response.data;
}
