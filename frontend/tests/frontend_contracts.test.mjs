import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_ROOT = path.resolve(import.meta.dirname, '..');

test('next.config.ts configures Watchmode CDN image hosts', () => {
  const cfg = fs.readFileSync(path.join(FRONTEND_ROOT, 'next.config.ts'), 'utf8');
  assert.match(cfg, /cdn\.watchmode\.com/);
  assert.match(cfg, /image\.tmdb\.org/);
});

test('error boundaries and admin analytics page exist', () => {
  for (const rel of [
    'src/app/error.tsx',
    'src/app/global-error.tsx',
    'src/app/admin/page.tsx',
  ]) {
    const full = path.join(FRONTEND_ROOT, rel);
    assert.equal(fs.existsSync(full), true, `Missing ${rel}`);
    const content = fs.readFileSync(full, 'utf8');
    assert.match(content, /export default function/);
  }
});

test('RootLayout includes accessible skip-to-content link', () => {
  const layout = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'src/app/layout.tsx'),
    'utf8'
  );
  assert.match(layout, /href="#main-content"/);
  assert.match(layout, /Skip to main content/);
});

test('analyticsService supports all 12 Day 6 product events and X-Admin-Key auth', () => {
  const svc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'src/services/analyticsService.ts'),
    'utf8'
  );
  const expectedEvents = [
    'content_viewed',
    'content_searched',
    'search_result_clicked',
    'watchlist_added',
    'watchlist_removed',
    'collection_created',
    'recommendation_displayed',
    'recommendation_clicked',
    'recommendation_feedback',
    'mira_conversation_started',
    'discover_filters_used',
    'streaming_availability_checked',
  ];
  for (const ev of expectedEvents) {
    assert.match(svc, new RegExp(ev));
  }
  assert.match(svc, /X-Admin-Key/);
});
