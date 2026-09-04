import { supabaseRequest, setSession } from '@/app/supabase-auth';
import { handleAuth } from '@/app/auth-service';
export function POST(request: Request) {
  return handleAuth(request, 'signup', { request: supabaseRequest, saveSession: setSession });
}
