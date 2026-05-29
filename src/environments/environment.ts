export const environment = {
  production: false,
  supabaseUrl: getEnv('SUPABASE_URL', 'https://YOUR_SUPABASE_PROJECT_URL'),
  supabaseKey: getEnv('SUPABASE_PUBLISHABLE_KEY', 'YOUR_SUPABASE_PUBLISHABLE_KEY'),
  supabaseServiceKey: getEnv('SUPABASE_SERVICE_KEY', '')
};

function getEnv(key: string, defaultValue: string): string {
  if (typeof window !== 'undefined' && (window as any).__env__) {
    return (window as any).__env__[key] || defaultValue;
  }
  return defaultValue;
}
