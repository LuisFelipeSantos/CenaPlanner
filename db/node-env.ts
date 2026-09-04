import { postgresDb } from './postgres';
// Runtime-only environment; Vite must never inline these secrets into client output.
export const env = new Proxy({} as Cloudflare.Env, {
  get(_target, key) {
    return key === 'DB' ? postgresDb : process.env[String(key)];
  },
});
