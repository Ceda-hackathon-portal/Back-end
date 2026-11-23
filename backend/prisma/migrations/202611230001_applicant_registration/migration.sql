-- Applicant self-registration with email verification (hackathon prototype).
-- CreateTable
CREATE TABLE "applicant_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applicant_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "registration_codes" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(200) NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registration_codes_email_created_at_idx" ON "registration_codes"("email", "created_at");

-- AddForeignKey
ALTER TABLE "applicant_credentials" ADD CONSTRAINT "applicant_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Guards: bounded attempts, expiry after creation.
ALTER TABLE "registration_codes" ADD CHECK (attempts >= 0 AND attempts <= 10 AND expires_at > created_at);
