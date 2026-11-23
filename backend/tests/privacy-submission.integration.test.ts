import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Router } from 'express';
import { pino } from 'pino';
import { Client } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { authRoutes } from '../src/modules/auth/routes.js';
import type { LocalAuthConfig } from '../src/modules/auth/config.js';
import { PrismaSessionStore } from '../src/modules/auth/store.js';
import { applicantPasswordHash } from '../src/modules/auth/crypto.js';
import type { Mail } from '../src/modules/notifications/email.js';
import { applicationRoutes } from '../src/modules/applications/routes.js';
import { applicationPrivacyRoutes, APPLICATION_PRIVACY_VERSION } from '../src/modules/applications/privacy-consent.js';

test('demo credentials and a newly verified applicant persist consent, upload and submit independently', { timeout: 60000 }, async () => {
  assert.match(process.env.DISPOSABLE_DATABASE_RUN ?? '', /^[a-f0-9-]{36}$/);
  const url = process.env.DATABASE_URL!;
  assert.equal(new URL(url).hostname, '127.0.0.1');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: '-c timezone=UTC', max: 4 }) });
  const admin = new Client({ connectionString: url });
  await admin.connect();
  const group = 'consent_' + randomBytes(6).toString('hex');
  const login = group + '_login';
  let runtime: PrismaClient | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  try {
    await admin.query(readFileSync('ops/runtime-role.sql', 'utf8').replaceAll('ceda_runtime', group));
    const secret = randomBytes(24).toString('hex');
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${secret}' IN ROLE ${group} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    const runtimeUrl = new URL(url);
    runtimeUrl.username = login;
    runtimeUrl.password = secret;
    runtime = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl.href, options: '-c timezone=UTC', max: 4 }) });
    const password = 'fictional test password only';
    const demoEmail = randomUUID() + '@example.test';
    const signupEmail = randomUUID() + '@example.test';
    const authConfig: LocalAuthConfig = {
      mode: 'local', email: demoEmail, name: 'Demo applicant', passwordHash: applicantPasswordHash(password),
      apiOrigin: 'http://localhost', frontendOrigin: 'http://localhost:5189', key: randomBytes(32).toString('hex'),
      secure: false, idleSeconds: 1800, absoluteSeconds: 28800,
    };
    const mails: Mail[] = [];
    const auth = authRoutes(authConfig, new PrismaSessionStore(runtime), undefined, {
      db: runtime, key: authConfig.key, mailer: { async send(mail) { mails.push(mail); } },
      isReservedEmail: email => email === demoEmail,
    });
    const router = Router();
    router.use('/auth', auth.router);
    router.use('/service', applicationPrivacyRoutes(runtime, auth.verifier, auth.requireCsrf));
    router.use('/applications', applicationRoutes(runtime, auth.verifier, auth.requireCsrf, { requirePrivacyConsent: true }));
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, DATABASE_SSL: 'false', ALLOWED_ORIGINS: authConfig.frontendOrigin });
    server = createServer(createApp(config, { apiRouter: router, database: { async check() {}, async close() {} }, logger: pino({ level: 'silent' }) }));
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
    function browser() {
      const cookies = new Map<string, string>();
      let csrf = '';
      const request = async (path: string, method = 'GET', body?: unknown, extra: Record<string,string> = {}) => {
        const raw = body instanceof Buffer;
        const response = await fetch(base + path, {
          method, signal: AbortSignal.timeout(5000),
          headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), Origin: authConfig.frontendOrigin,
            'X-CSRF-Token': csrf, ...(body === undefined ? {} : { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' }), ...extra },
          ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
        });
        for (const setCookie of response.headers.getSetCookie()) {
          const pair = setCookie.split(';')[0]!;
          const split = pair.indexOf('=');
          cookies.set(pair.slice(0,split),pair.slice(split+1));
        }
        return response;
      };
      return { request, async refreshCsrf() { const response = await request('/auth/csrf'); assert.equal(response.status,200); csrf = (await response.json()).data.csrfToken; } };
    }
    const demo = browser();
    const registered = browser();
    assert.equal((await demo.request('/service/privacy/consent','POST',{version:APPLICATION_PRIVACY_VERSION,accepted:true})).status,401);
    await demo.refreshCsrf();
    assert.equal((await demo.request('/auth/local-login','POST',{email:demoEmail,password})).status,200);
    await demo.refreshCsrf();
    await registered.refreshCsrf();
    const registration = await registered.request('/auth/register','POST',{name:'Registered applicant',email:signupEmail,password});
    assert.equal(registration.status,202);
    const verificationId = (await registration.json()).data.verificationId;
    const code = /verification code is (\d{6})/.exec(mails[0]!.text)![1]!;
    assert.equal((await registered.request('/auth/register/verify','POST',{verificationId,code})).status,201);
    await registered.refreshCsrf();
    const programme = await db.programme.create({data:{code:randomUUID(),name:'QA submission repair'}});
    const version = await db.programmeVersion.create({data:{programmeId:programme.id,version:1,publishedAt:new Date(Date.now()-10000),opensAt:new Date(Date.now()-10000),closesAt:new Date(Date.now()+600000),config:{themes:['digital']}}});
    let firstConsentUser = '';
    for (const [index, account] of [demo, registered].entries()) {
      const session = (await (await account.request('/auth/session')).json()).data;
      const userId = session.user.id as string;
      const created = await account.request('/applications','POST',{programmeId:programme.id,programmeVersionId:version.id});
      assert.equal(created.status,201);
      const draft = (await created.json()).data;
      assert.equal(draft.ownerId,userId);
      const fields = {title:'QA repair '+index,theme:'digital',problem:'Fictional problem',solution:'Fictional solution',impact:'Fictional impact',team:'QA only'};
      assert.equal((await account.request('/applications/'+draft.id,'PATCH',{expectedRevision:0,fields,budget:{items:[],fundingRequested:'',notApplicable:true}})).status,200);
      const params = new URLSearchParams({name:'qa-proposal.pdf',category:'technical-proposal',expectedRevision:'1'});
      const uploaded = await account.request('/applications/'+draft.id+'/documents?'+params,'POST',Buffer.from('%PDF-1.7\nQA test proposal\n'));
      assert.equal(uploaded.status,201);
      const document = (await uploaded.json()).data;
      const submit = () => account.request('/applications/'+draft.id+'/submit','POST',{expectedRevision:document.revision},{'Idempotency-Key':'qa-submit-'+index});
      const refused = await submit();
      assert.equal(refused.status,422);
      assert.equal((await refused.json()).error.code,'PRIVACY_CONSENT_REQUIRED');
      assert.equal((await account.request('/service/privacy/consent','POST',{version:APPLICATION_PRIVACY_VERSION,accepted:true},{'X-CSRF-Token':'invalid'})).status,403);
      assert.equal((await account.request('/service/privacy/consent','POST',{version:APPLICATION_PRIVACY_VERSION,accepted:false})).status,422);
      assert.equal((await account.request('/service/privacy/consent','POST',{version:'outdated',accepted:true})).status,422);
      assert.equal((await account.request('/service/privacy/consent','POST',{version:APPLICATION_PRIVACY_VERSION,accepted:true,userId:firstConsentUser || randomUUID()})).status,422);
      assert.equal((await account.request('/service/privacy/consent','POST',{version:APPLICATION_PRIVACY_VERSION,accepted:true})).status,204);
      const consent = await db.applicationPrivacyConsent.findUniqueOrThrow({where:{userId_noticeVersion:{userId,noticeVersion:APPLICATION_PRIVACY_VERSION}}});
      assert.ok(consent.acceptedAt instanceof Date);
      assert.match(consent.requestId,/^[a-f0-9-]{36}$/);
      assert.equal((await account.request('/service/privacy/consent','POST',{version:APPLICATION_PRIVACY_VERSION,accepted:true})).status,204);
      assert.deepEqual(await db.applicationPrivacyConsent.findUnique({where:{userId_noticeVersion:{userId,noticeVersion:APPLICATION_PRIVACY_VERSION}}}),consent);
      const submitted = await submit();
      const submittedBody = await submitted.json();
      assert.equal(submitted.status,200,JSON.stringify(submittedBody));
      const receipt = submittedBody.data;
      assert.equal((await (await submit()).json()).data.id,receipt.id);
      const restored = (await (await account.request('/applications/'+draft.id)).json()).data;
      assert.equal(restored.stage,'SUBMITTED');
      assert.equal(restored.latestSubmission.id,receipt.id);
      assert.equal(restored.latestSubmission.documents[0].id,document.id);
      assert.equal(await db.submissionVersion.count({where:{applicationId:draft.id}}),1);
      firstConsentUser = userId;
    }
    assert.equal(await db.applicationPrivacyConsent.count(),2);
    await assert.rejects(db.$executeRaw`UPDATE application_privacy_consents SET notice_version=notice_version`,{code:'P2010'});
    await assert.rejects(db.$executeRaw`DELETE FROM application_privacy_consents`,{code:'P2010'});
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(()=>resolve()));
    await runtime?.$disconnect();
    await db.$disconnect();
    await admin.query(`DROP OWNED BY ${login}, ${group}`);
    await admin.query(`DROP ROLE ${login}, ${group}`);
    await admin.end();
  }
});
