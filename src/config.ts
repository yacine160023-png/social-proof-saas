import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  openaiApiKey: required('OPENAI_API_KEY'),
  bannerbearApiKey: required('BANNERBEAR_API_KEY'),
  bannerbearTemplateId: required('BANNERBEAR_TEMPLATE_ID'),
  cronSecret: required('CRON_SECRET')
};

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
export const openai = new OpenAI({ apiKey: config.openaiApiKey });
