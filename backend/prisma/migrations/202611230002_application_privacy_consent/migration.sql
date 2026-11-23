CREATE TABLE application_privacy_consents (
  user_id UUID NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  notice_version VARCHAR(32) NOT NULL CHECK (notice_version <> ''),
  accepted_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_id UUID NOT NULL,
  PRIMARY KEY (user_id, notice_version)
);

CREATE FUNCTION reject_application_privacy_consent_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Application privacy consent records are append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER application_privacy_consent_append_only
BEFORE UPDATE OR DELETE ON application_privacy_consents
FOR EACH ROW EXECUTE FUNCTION reject_application_privacy_consent_change();
CREATE TRIGGER application_privacy_consent_no_truncate
BEFORE TRUNCATE ON application_privacy_consents
FOR EACH STATEMENT EXECUTE FUNCTION reject_application_privacy_consent_change();
REVOKE ALL ON application_privacy_consents FROM PUBLIC;

-- Existing deployments already have this group. New installations receive the
-- same narrow grant when ops/runtime-role.sql provisions the runtime group.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ceda_runtime') THEN
    GRANT SELECT, INSERT ON application_privacy_consents TO ceda_runtime;
  END IF;
END; $$;
