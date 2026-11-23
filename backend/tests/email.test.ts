import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmailNotifier, emailConfig, retryDelayMs, submissionReceivedEmail, type Mail } from '../src/modules/notifications/email.js';
import { loadConfig } from '../src/config/env.js';

const base = { DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db' };

test('email stays off unless host, user and password are all set', () => {
  assert.equal(emailConfig(loadConfig(base)), null);
  assert.equal(emailConfig(loadConfig({ ...base, SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@example.test' })), null);
  const on = emailConfig(loadConfig({ ...base, SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@example.test', SMTP_PASS: 'x' }));
  assert.equal(on?.SMTP_PORT, 465);
  assert.throws(() => loadConfig({ ...base, MAIL_REDIRECT_TO: 'not-an-email' }));
});

test('submission email carries the reference and a link, never idea content, and escapes HTML', () => {
  const mail = submissionReceivedEmail({ name: 'Naledi <b>', reference: 'CEDA-123', linkOrigin: 'https://portal.example.test/' });
  assert.equal(mail.subject, 'CEDA application received: CEDA-123');
  assert.match(mail.text, /reference number is CEDA-123/);
  assert.match(mail.text, /https:\/\/portal\.example\.test\/workspace/);
  assert.match(mail.html, /Naledi &lt;b&gt;/);
  assert.doesNotMatch(mail.html, /<b>/);
});

test('retry delay doubles and caps at one hour', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map(retryDelayMs), [60000, 120000, 240000, 480000, 3600000]);
});

function fakeDb(jobs: Array<{ id: string; attempts: number; claimed?: boolean }>) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const db = { outboxEvent: {
    findMany: async () => jobs.map(j => ({ id: j.id, attempts: j.attempts, recipient: { email: 'owner@example.test', name: 'Owner' },
      audit: { application: { submissions: [{ reference: `REF-${j.id}` }] } } })),
    updateMany: async ({ where }: { where: { id: string } }) => ({ count: jobs.find(j => j.id === where.id)?.claimed === false ? 0 : 1 }),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { updates.push({ id: where.id, data }); },
  } };
  return { db, updates };
}
const logger = { info() {}, warn() {}, error() {} };
const config = { SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_PORT: 465, EMAIL_POLL_MS: 15000, MAIL_REDIRECT_TO: 'team@example.test' };

test('notifier sends claimed jobs once, redirects in demo mode, and backs off on failure', async () => {
  const { db, updates } = fakeDb([{ id: 'a', attempts: 0 }, { id: 'b', attempts: 0, claimed: false }, { id: 'c', attempts: 2 }]);
  const sent: Mail[] = [];
  const transport = { async send(mail: Mail) { if (mail.subject.includes('REF-c')) throw new Error('smtp down'); sent.push(mail); } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifier = new EmailNotifier(db as any, transport, config as any, logger as any);
  const now = new Date('2026-11-23T10:00:00Z');
  assert.equal(await notifier.tick(now), 1);
  assert.deepEqual(sent.map(m => m.to), ['team@example.test']);         // a: sent, to the redirect inbox
  assert.ok(updates.find(u => u.id === 'a')?.data.deliveredAt);          // a: marked delivered
  assert.equal(updates.find(u => u.id === 'b'), undefined);              // b: another task holds it, untouched
  const failed = updates.find(u => u.id === 'c')?.data;                  // c: failed, retried later
  assert.equal(failed?.attempts, 3);
  assert.equal((failed?.availableAt as Date).getTime(), now.getTime() + 4 * 60000);
});
