import { supabase } from './config.js';
import { processReviewText } from './services/ai.js';
import { generateSocialImage } from './services/banner.js';
import { publishToSocials } from './services/social.js';

type ClientRunStatus = 'running' | 'completed' | 'skipped' | 'failed';

type AutomationRun = {
  id: string;
  clients_processed: number;
  reviews_published: number;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return 'Unknown error'; }
}

async function updateAutomationRun(runId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('automation_runs').update(patch).eq('id', runId);
  if (error) console.error(`Could not update automation run ${runId}:`, error.message);
}

async function recordClientRun(runId: string, clientId: string, status: ClientRunStatus, patch: Record<string, unknown> = {}) {
  const { error } = await supabase.from('automation_client_runs').upsert({
    automation_run_id: runId,
    user_id: clientId,
    status,
    ...patch,
    finished_at: status === 'running' ? null : new Date().toISOString()
  }, { onConflict: 'automation_run_id,user_id' });
  if (error) console.error(`Could not record client run ${clientId}:`, error.message);
}

async function claimReview(reviewId: string, clientId: string, runId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .update({ processing_run_id: runId })
    .eq('id', reviewId)
    .eq('user_id', clientId)
    .eq('is_published', false)
    .is('processing_run_id', null)
    .select('id, text, author_name, rating')
    .maybeSingle();
  if (error) throw new Error(`review_claim: ${error.message}`);
  return data;
}

export async function runWeeklyAutomation(): Promise<void> {
  console.log('Starting weekly automation');
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .insert({ status: 'running' })
    .select('id, clients_processed, reviews_published')
    .single();
  if (runError || !run) throw new Error(`Failed to create automation run: ${runError?.message ?? 'unknown error'}`);

  const automationRun = run as AutomationRun;
  let clientsProcessed = 0;
  let reviewsPublished = 0;

  try {
    const { data: clients, error: clientsError } = await supabase
      .from('users')
      .select('id, company_name, ayrshare_api_key')
      .eq('subscription_status', 'active');
    if (clientsError) throw new Error(`Failed to load clients: ${clientsError.message}`);

    for (const client of clients ?? []) {
      clientsProcessed++;
      await updateAutomationRun(automationRun.id, { clients_processed: clientsProcessed });
      await recordClientRun(automationRun.id, client.id, 'running', { stage: 'review_lookup' });

      let claimed = false;
      let reviewId: string | null = null;
      try {
        const { data: candidate, error: reviewError } = await supabase
          .from('reviews')
          .select('id')
          .eq('user_id', client.id)
          .eq('rating', 5)
          .eq('is_published', false)
          .is('processing_run_id', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (reviewError) throw new Error(`review_lookup: ${reviewError.message}`);
        if (!candidate) {
          await recordClientRun(automationRun.id, client.id, 'skipped', { stage: 'review_lookup', message: 'No unpublished 5-star review available' });
          continue;
        }

        const review = await claimReview(candidate.id, client.id, automationRun.id);
        if (!review) {
          await recordClientRun(automationRun.id, client.id, 'skipped', { stage: 'review_lookup', message: 'Review already claimed by another run' });
          continue;
        }
        claimed = true;
        reviewId = review.id;

        await recordClientRun(automationRun.id, client.id, 'running', { review_id: review.id, stage: 'ai_generation' });
        let aiContent;
        try { aiContent = await processReviewText(review.text, review.author_name); }
        catch (error) { throw new Error(`ai_generation: ${errorMessage(error)}`); }

        await recordClientRun(automationRun.id, client.id, 'running', { review_id: review.id, stage: 'image_generation' });
        let imageUrl: string;
        try { imageUrl = await generateSocialImage(aiContent.shortQuote, review.author_name, review.rating); }
        catch (error) { throw new Error(`image_generation: ${errorMessage(error)}`); }

        await recordClientRun(automationRun.id, client.id, 'running', { review_id: review.id, stage: 'social_publish' });
        try { await publishToSocials(client.ayrshare_api_key, imageUrl, aiContent.caption); }
        catch (error) { throw new Error(`social_publish: ${errorMessage(error)}`); }

        const { data: published, error: updateError } = await supabase
          .from('reviews')
          .update({ is_published: true, published_at: new Date().toISOString(), processing_run_id: null })
          .eq('id', review.id)
          .eq('user_id', client.id)
          .eq('is_published', false)
          .select('id')
          .maybeSingle();
        if (updateError) throw new Error(`review_update: ${updateError.message}`);
        if (!published) throw new Error('review_update: review was changed by another process');

        reviewsPublished++;
        await updateAutomationRun(automationRun.id, { reviews_published: reviewsPublished });
        await recordClientRun(automationRun.id, client.id, 'completed', { review_id: review.id, stage: 'completed', message: 'Review published successfully' });
      } catch (error) {
        const message = errorMessage(error);
        console.error(`Client ${client.company_name ?? client.id} failed: ${message}`);
        if (claimed && reviewId) {
          await supabase.from('reviews').update({ processing_run_id: null }).eq('id', reviewId).eq('user_id', client.id).eq('is_published', false);
        }
        await recordClientRun(automationRun.id, client.id, 'failed', { review_id: reviewId, stage: message.split(':')[0] ?? 'unknown', error_message: message });
      }
    }

    await updateAutomationRun(automationRun.id, {
      status: 'completed', finished_at: new Date().toISOString(), clients_processed: clientsProcessed, reviews_published: reviewsPublished
    });
  } catch (error) {
    const message = errorMessage(error);
    await updateAutomationRun(automationRun.id, { status: 'failed', finished_at: new Date().toISOString(), error_message: message, clients_processed: clientsProcessed, reviews_published: reviewsPublished });
    throw error;
  }
}
