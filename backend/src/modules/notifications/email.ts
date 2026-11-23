import nodemailer from 'nodemailer';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config/env.js';
import type { createLogger } from '../../shared/logging.js';

/** Outbox kinds that produce an applicant email. Other kinds stay queued for future channels. */
export const EMAIL_KINDS = ['application.submitted'] as const;
const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60 * 1000;

export interface Mail { to: string; subject: string; text: string; html: string }
export interface MailTransport { send(mail: Mail): Promise<void> }
type Logger = ReturnType<typeof createLogger>;

export type EmailConfig = { SMTP_HOST: string; SMTP_USER: string; SMTP_PASS: string } &
  Pick<Config, 'SMTP_PORT' | 'MAIL_FROM' | 'MAIL_REDIRECT_TO' | 'MAIL_LINK_ORIGIN' | 'EMAIL_POLL_MS'>;

/** Email is enabled only when the three SMTP settings are present. */
export function emailConfig(config: Config): EmailConfig | null {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) return null;
  return { ...config, SMTP_HOST: config.SMTP_HOST, SMTP_USER: config.SMTP_USER, SMTP_PASS: config.SMTP_PASS };
}

export function smtpTransport(config: EmailConfig): MailTransport {
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_PORT === 465, requireTLS: config.SMTP_PORT !== 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS.replace(/\s+/g, '') },
  });
  const from = config.MAIL_FROM ?? `CEDA Innovation Portal <${config.SMTP_USER}>`;
  return { async send(mail) { await transporter.sendMail({ from, ...mail }); } };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

/** The message never contains idea content, scores or reviewer names: only the reference and a link. */
export function submissionReceivedEmail(input: { name: string; reference: string; linkOrigin?: string | undefined }): Omit<Mail, 'to'> {
  const link = input.linkOrigin ? `${input.linkOrigin.replace(/\/+$/, '')}/workspace` : null;
  const lines = [
    `Dumela ${input.name},`,
    '',
    'CEDA has received your application.',
    `Your reference number is ${input.reference}. Keep it for any enquiry.`,
    '',
    'What happens next: an eligibility officer checks your application, then it goes to independent evaluators.',
    'You will be told at every stage, and every decision comes with a reason.',
    ...(link ? ['', `Track your application: ${link}`] : []),
    '',
    'CEDA Innovation Portal',
    'This is an automated message. Do not reply with personal or business information.',
  ];
  const html = `<p>Dumela ${escapeHtml(input.name)},</p><p>CEDA has received your application.<br>Your reference number is <strong>${escapeHtml(input.reference)}</strong>. Keep it for any enquiry.</p>`
    + '<p>What happens next: an eligibility officer checks your application, then it goes to independent evaluators. You will be told at every stage, and every decision comes with a reason.</p>'
    + (link ? `<p><a href="${escapeHtml(link)}">Track your application</a></p>` : '')
    + '<p style="color:#666;font-size:12px">CEDA Innovation Portal. This is an automated message. Do not reply with personal or business information.</p>';
  return { subject: `CEDA application received: ${input.reference}`, text: lines.join('\n'), html };
}

/** Wait before the next attempt: 1, 2, 4 ... minutes, capped at one hour. */
export function retryDelayMs(attempts: number) { return Math.min(60, 2 ** Math.max(0, attempts)) * 60 * 1000; }

/** Delivers queued applicant emails. Claims each job with a lease first, so parallel API tasks never send twice. */
export class EmailNotifier {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private readonly db: PrismaClient, private readonly transport: MailTransport,
    private readonly config: EmailConfig, private readonly logger: Logger) {}

  start() { this.timer = setInterval(() => { void this.tick(); }, this.config.EMAIL_POLL_MS); this.timer.unref(); void this.tick(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      const due = await this.db.outboxEvent.findMany({
        where: { kind: { in: [...EMAIL_KINDS] }, deliveredAt: null, availableAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { createdAt: 'asc' }, take: 10,
        select: { id: true, attempts: true, recipient: { select: { email: true, name: true } },
          audit: { select: { application: { select: { submissions: { select: { reference: true }, orderBy: { version: 'desc' }, take: 1 } } } } } },
      });
      for (const job of due) {
        const claimed = await this.db.outboxEvent.updateMany({
          where: { id: job.id, deliveredAt: null, availableAt: { lte: now } }, data: { availableAt: new Date(now.getTime() + LEASE_MS) } });
        if (claimed.count !== 1) continue;
        const reference = job.audit.application.submissions.at(0)?.reference;
        try {
          if (!reference) throw new Error('submission reference missing');
          const message = submissionReceivedEmail({ name: job.recipient.name, reference, linkOrigin: this.config.MAIL_LINK_ORIGIN });
          await this.transport.send({ to: this.config.MAIL_REDIRECT_TO ?? job.recipient.email, ...message });
          await this.db.outboxEvent.update({ where: { id: job.id }, data: { deliveredAt: new Date() } });
          sent += 1;
          this.logger.info({ outboxId: job.id }, 'email_sent');
        } catch {
          // Never log the address, message or SMTP error text: they can carry personal data or credentials.
          await this.db.outboxEvent.update({ where: { id: job.id },
            data: { attempts: job.attempts + 1, availableAt: new Date(now.getTime() + retryDelayMs(job.attempts)) } });
          this.logger.warn({ outboxId: job.id, attempt: job.attempts + 1 }, 'email_failed');
        }
      }
    } catch {
      this.logger.error({ code: 'EMAIL_POLL_FAILED' }, 'email_poll_failed');
    } finally {
      this.running = false;
    }
    return sent;
  }
}
