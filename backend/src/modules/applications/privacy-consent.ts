import { Router, type Request } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Principal, SessionVerifier } from '../../shared/authorization.js';
import { requireActiveSession } from '../auth/session-access.js';
import { HttpError } from '../../shared/errors.js';
import { validateBody } from '../../shared/validation.js';

export const APPLICATION_PRIVACY_VERSION = '2026-11-23';

// This small route preserves the frontend contract without requiring the separate
// chat/reporting service to be installed before an applicant can submit.
export function applicationPrivacyRoutes(db: PrismaClient, sessions: SessionVerifier, requireCsrf: (request: Request) => void) {
  const router = Router();
  router.post('/privacy/consent', async (req, res, next) => {
    const principal = await sessions.verify(req.headers.cookie);
    if (!principal) throw new HttpError(401, 'UNAUTHENTICATED', 'A valid session is required.');
    requireCsrf(req);
    res.locals.principal = principal;
    next();
  }, validateBody(z.strictObject({ version: z.literal(APPLICATION_PRIVACY_VERSION), accepted: z.literal(true) })), async (_req, res) => {
    await db.$transaction(async tx => {
      const principal = res.locals.principal as Principal;
      await requireActiveSession(tx, principal);
      // Append-only and deduplicated by account and notice version. Neither a
      // supplied account ID nor a browser timestamp can establish consent.
      await tx.applicationPrivacyConsent.createMany({
        data: { userId: principal.userId, noticeVersion: APPLICATION_PRIVACY_VERSION, requestId: res.locals.requestId as string },
        skipDuplicates: true,
      });
    });
    res.sendStatus(204);
  });
  return router;
}
