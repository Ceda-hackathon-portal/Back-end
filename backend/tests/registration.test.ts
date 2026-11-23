import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeHash, completeRegistration, startRegistration, MAX_CODE_ATTEMPTS, REGISTRATION_ISSUER, type RegistrationDeps } from '../src/modules/auth/registration.js';
import { recipientFor, type Mail } from '../src/modules/notifications/email.js';
import { verifyLocalPassword } from '../src/modules/auth/crypto.js';

type Row = { id: string; email: string; name: string; passwordHash: string; codeHash: string; attempts: number; expiresAt: Date; consumedAt: Date | null; createdAt: Date };
const key = 'a'.repeat(64);

function harness(existingEmails: string[] = []) {
  const rows: Row[] = []; const mails: Mail[] = [];
  const db = {
    registrationCode: {
      count: async ({ where }: { where: { email: string; createdAt: { gt: Date } } }) => rows.filter(r => r.email === where.email && r.createdAt > where.createdAt.gt).length,
      create: async ({ data }: { data: Omit<Row, 'attempts' | 'consumedAt'> }) => { rows.push({ attempts: 0, consumedAt: null, ...data }); },
      findUnique: async ({ where }: { where: { id: string } }) => rows.find(r => r.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; consumedAt: null }; data: { attempts?: { increment: number }; consumedAt?: Date } }) => {
        const row = rows.find(r => r.id === where.id && r.consumedAt === null); if (!row) return { count: 0 };
        if (data.attempts) row.attempts += data.attempts.increment; if (data.consumedAt) row.consumedAt = data.consumedAt; return { count: 1 };
      },
    },
    authUser: { findUnique: async ({ where }: { where: { email: string } }) => existingEmails.includes(where.email) ? { id: 'u1' } : null },
  };
  const deps = { db, key, mailer: { async send(mail: Mail) { mails.push(mail); } }, isReservedEmail: (e: string) => e === 'manager@example.test' } as unknown as RegistrationDeps;
  return { rows, mails, deps };
}
const codeIn = (mail: Mail) => /verification code is (\d{6})/.exec(mail.text)?.[1] ?? '';

test('a new applicant gets a 6-digit code by email; the code and password are stored only as hashes', async () => {
  const { rows, mails, deps } = harness();
  const out = await startRegistration(deps, { name: 'Naledi', email: ' Naledi@Example.org ', password: 'correct horse battery' });
  assert.equal(mails.length, 1); assert.equal(mails[0]!.to, 'naledi@example.org');
  const code = codeIn(mails[0]!); assert.match(code, /^\d{6}$/);
  assert.equal(rows[0]!.codeHash, codeHash(key, out.verificationId, code));
  assert.ok(!JSON.stringify(rows).includes(code), 'code not stored in readable form');
  assert.ok(verifyLocalPassword('correct horse battery', rows[0]!.passwordHash));
});

test('an email that already has an account gets a notice, not a code, and the same response shape', async () => {
  for (const email of ['taken@example.org', 'manager@example.test']) {
    const { mails, deps, rows } = harness(['taken@example.org']);
    const out = await startRegistration(deps, { name: 'X', email, password: 'correct horse battery' });
    assert.ok(out.verificationId && out.expiresAt);
    assert.match(mails[0]!.subject, /already exists/); assert.equal(codeIn(mails[0]!), '');
    await assert.rejects(completeRegistration(deps, { verificationId: out.verificationId, code: '000000' }), { code: 'CODE_INVALID' });
    assert.equal(rows.length, 1);
  }
});

test('at most 3 codes per email in 15 minutes', async () => {
  const { deps } = harness();
  for (let i = 0; i < 3; i += 1) await startRegistration(deps, { name: 'N', email: 'n@example.org', password: 'correct horse battery' });
  await assert.rejects(startRegistration(deps, { name: 'N', email: 'n@example.org', password: 'correct horse battery' }), { status: 429 });
});

test('the right code creates an applicant identity once; wrong codes count, and expiry and reuse are refused', async () => {
  const { mails, deps, rows } = harness();
  const now = new Date('2026-11-23T10:00:00Z');
  const { verificationId } = await startRegistration(deps, { name: 'Kgosi', email: 'kgosi@example.org', password: 'correct horse battery' }, now);
  const code = codeIn(mails[0]!); const wrong = code === '000000' ? '000001' : '000000';
  await assert.rejects(completeRegistration(deps, { verificationId, code: wrong }, now), { code: 'CODE_INVALID' });
  assert.equal(rows[0]!.attempts, 1);
  const done = await completeRegistration(deps, { verificationId, code }, now);
  assert.deepEqual(done.identity, { issuer: REGISTRATION_ISSUER, subject: 'kgosi@example.org', email: 'kgosi@example.org', name: 'Kgosi' });
  await assert.rejects(completeRegistration(deps, { verificationId, code }, now), { code: 'CODE_INVALID' }); // single use

  const second = await startRegistration(deps, { name: 'K2', email: 'k2@example.org', password: 'correct horse battery' }, now);
  const later = new Date(now.getTime() + 11 * 60 * 1000);
  await assert.rejects(completeRegistration(deps, { verificationId: second.verificationId, code: codeIn(mails[1]!) }, later), { code: 'CODE_INVALID' });
});

test('after 5 wrong codes even the right one is refused', async () => {
  const { mails, deps } = harness();
  const { verificationId } = await startRegistration(deps, { name: 'Z', email: 'z@example.org', password: 'correct horse battery' });
  const code = codeIn(mails[0]!); const wrong = code === '999999' ? '999998' : '999999';
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) await assert.rejects(completeRegistration(deps, { verificationId, code: wrong }));
  await assert.rejects(completeRegistration(deps, { verificationId, code }), { code: 'CODE_INVALID' });
});

test('only fictional demo addresses are redirected to the team inbox', () => {
  assert.equal(recipientFor('applicant2@example.test', 'team@gmail.com'), 'team@gmail.com');
  assert.equal(recipientFor('real.person@gmail.com', 'team@gmail.com'), 'real.person@gmail.com');
  assert.equal(recipientFor('applicant2@example.test'), 'applicant2@example.test');
});
