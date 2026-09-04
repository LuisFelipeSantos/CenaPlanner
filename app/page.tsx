import Dashboard from './dashboard';
import AuthScreen from './auth-screen';
import { getAppUser } from './supabase-auth';
import SessionGuard from './session-guard';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getAppUser();
  if (!user) return <SessionGuard authenticated={false}><AuthScreen /></SessionGuard>;
  return <SessionGuard authenticated><Dashboard accountName={user.fullName ?? user.email.split('@')[0]} accountEmail={user.email} /></SessionGuard>;
}
