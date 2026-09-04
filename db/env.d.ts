declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    NOTIFICATION_CRON_SECRET?: string;
    EMAIL_GATEWAY_URL?: string;
    NOTIFICATION_GATEWAY_TOKEN?: string;
    SUPABASE_URL: string;
    SUPABASE_PUBLISHABLE_KEY: string;
  }
}
