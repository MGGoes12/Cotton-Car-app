#!/usr/bin/env node

/**
 * Inject environment variables into index.html for runtime use.
 * Run this after the Angular build completes.
 * Replaces ${SUPABASE_URL} and ${SUPABASE_PUBLISHABLE_KEY} placeholders
 * with actual values from the environment (e.g. Vercel env vars).
 */

const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '../dist/cotton-car-booking/index.html');

if (fs.existsSync(distPath)) {
  let html = fs.readFileSync(distPath, 'utf8');

  html = html.replace('${SUPABASE_URL}', process.env.SUPABASE_URL || '');
  html = html.replace('${SUPABASE_PUBLISHABLE_KEY}', process.env.SUPABASE_PUBLISHABLE_KEY || '');

  fs.writeFileSync(distPath, html, 'utf8');
  console.log('✓ Environment variables injected into index.html');
} else {
  console.warn('⚠ index.html not found at', distPath);
}
