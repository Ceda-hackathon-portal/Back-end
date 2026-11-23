import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { MailTransport } from '../notifications/email.js';
import { HttpError } from '../../shared/errors.js';
import { applicantPasswordHash, equal, verifyLocalPassword } from './crypto.js';

/** Applicant self-registration: email + password, confirmed by a 6-digit code sent by email. Never grants staff access. */
export const REGISTRATION_ISSUER = 'urn:ceda:local-registration';
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_WINDOW = 3;
export const CODE_WINDOW_MS = 15 * 60 * 1000;

export interface RegistrationDeps {
  db: PrismaClient;
  mailer: MailTransport;
  key: string;                       // server-only 64-hex key, also used for CSRF
  linkOrigin?: string | undefined;    // frontend origin for links in emails
  isReservedEmail: (email: string) => boolean; // demo/staff accounts from the accounts file
}

export const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const codeHash = (key: string, id: string, code: string) => createHmac('sha256', key).update(`registration:${id}:${code}`).digest('hex');

export function codeEmail(name: string, code: string) {
  const text = [`Dumela ${name},`, '', `Your CEDA Innovation Portal verification code is ${code}.`, '',
    'Enter it on the sign-up page within 10 minutes. If you did not ask for an account, ignore this email.', '',
    'CEDA never asks for this code by phone or SMS.'].join('\n');
  const html = `<p>Dumela ${escape(name)},</p><p>Your CEDA Innovation Portal verification code is</p>`
    + `<p style="font-size:28px;font-weight:600;letter-spacing:6px">${code}</p>`
    + '<p>Enter it on the sign-up page within 10 minutes. If you did not ask for an account, ignore this email.</p>'
    + '<p style="color:#666;font-size:12px">CEDA never asks for this code by phone or SMS.</p>';
  return { subject: `${code} is your CEDA verification code`, text, html };
}

export function existingAccountEmail(name: string, linkOrigin?: string) {
  const link = linkOrigin ? `${linkOrigin.replace(/\/+$/, '')}/login` : null;
  const text = [`Dumela ${name},`, '', 'Someone tried to create a CEDA Innovation Portal account with this email address, which already has one.',
    'If it was you, sign in instead' + (link ? `: ${link}` : '.'), 'If it was not you, you can ignore this email.'].join('\n');
  const html = `<p>Dumela ${escape(name)},</p><p>Someone tried to create a CEDA Innovation Portal account with this email address, which already has one.</p>`
    + `<p>If it was you, ${link ? `<a href="${escape(link)}">sign in instead</a>` : 'sign in instead'}. If it was not you, you can ignore this email.</p>`;
  return { subject: 'Your CEDA account already exists', text, html };
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

async function emailInUse(deps: RegistrationDeps, email: string) {
  if (deps.isReservedEmail(email)) return true;
  const user = await deps.db.authUser.findUnique({ where: { email }, select: { id: true } });
  return Boolean(user);
}

/**
 * Starts a registration. The response is the same whether or not the email already has an account,
 * so the endpoint cannot be used to discover who is registered: an existing owner gets a notice instead of a code.
 */
export async function startRegistration(deps: RegistrationDeps, input: { name: string; email: string; password: string }, now = new Date()) {
  const email = input.email.trim().toLowerCase(); const name = input.name.trim();
  const recent = await deps.db.registrationCode.count({ where: { email, createdAt: { gt: new Date(now.getTime() - CODE_WINDOW_MS) } } });
  if (recent >= MAX_CODES_PER_WINDOW) throw new HttpError(429, 'RATE_LIMITED', 'Too many codes requested. Wait 15 minutes and try again.');
  const id = randomUUID(); const code = sixDigitCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  const inUse = await emailInUse(deps, email);
  // A row is stored either way (so the rate limit counts both), but an in-use email's code can never complete.
  await deps.db.registrationCode.create({ data: { id, email, name, passwordHash: inUse ? 'in-use' : applicantPasswordHash(input.password),
    codeHash: codeHash(deps.key, id, inUse ? 'never' : code), expiresAt, createdAt: now } });
  const message = inUse ? existingAccountEmail(name, deps.linkOrigin) : codeEmail(name, code);
  try { await deps.mailer.send({ to: email, ...message }); }
  catch { throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'We could not send the verification email. Try again in a few minutes.'); }
  return { verificationId: id, expiresAt: expiresAt.toISOString() };
}

const invalid = () => new HttpError(400, 'CODE_INVALID', 'That code is wrong or has expired. Check the latest email or request a new code.');

/** Confirms the code. Returns the identity to sign in; creates the applicant user, identity and credential. */
export async function completeRegistration(deps: RegistrationDeps, input: { verificationId: string; code: string }, now = new Date()) {
  const row = await deps.db.registrationCode.findUnique({ where: { id: input.verificationId } });
  if (!row || row.consumedAt || row.expiresAt <= now || row.attempts >= MAX_CODE_ATTEMPTS) throw invalid();
  if (!equal(codeHash(deps.key, row.id, input.code), row.codeHash)) {
    await deps.db.registrationCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { attempts: { increment: 1 } } });
    throw invalid();
  }
  // Single use: only one request can flip consumed_at.
  const claimed = await deps.db.registrationCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
  if (claimed.count !== 1 || await emailInUse(deps, row.email)) throw invalid();
  return { identity: { issuer: REGISTRATION_ISSUER, subject: row.email, email: row.email, name: row.name }, passwordHash: row.passwordHash };
}

/** After the session (and so the user) exists: store the password so the applicant can sign in again later. */
export async function saveCredential(db: PrismaClient, email: string, passwordHash: string) {
  const user = await db.authUser.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new HttpError(500, 'INTERNAL_ERROR', 'The account could not be created.');
  await db.applicantCredential.create({ data: { userId: user.id, passwordHash } });
}

/** Password sign-in for a registered applicant. Null when the email has no applicant credential or the password is wrong. */
export async function verifyRegisteredApplicant(db: PrismaClient, email: string, password: string) {
  const user = await db.authUser.findUnique({ where: { email }, select: { name: true, status: true, applicantCredential: { select: { passwordHash: true } } } });
  if (!user?.applicantCredential || user.status !== 'ACTIVE') return null;
  return verifyLocalPassword(password, user.applicantCredential.passwordHash)
    ? { issuer: REGISTRATION_ISSUER, subject: email, email, name: user.name } : null;
}
