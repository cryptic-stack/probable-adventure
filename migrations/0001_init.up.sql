CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin','instructor','student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin','instructor','student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  definition_json JSONB NOT NULL,
  quota INTEGER NOT NULL DEFAULT 1,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, version)
);

CREATE TABLE ranges (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  template_id BIGINT NOT NULL REFERENCES templates(id),
  owner_user_id BIGINT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','provisioning','ready','destroying','destroyed','failed')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE range_resources (
  id BIGSERIAL PRIMARY KEY,
  range_id BIGINT NOT NULL REFERENCES ranges(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('network','container')),
  docker_id TEXT NOT NULL,
  service_name TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(resource_type, docker_id)
);

CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  range_id BIGINT NOT NULL REFERENCES ranges(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  job_type TEXT NOT NULL CHECK (job_type IN ('provision','destroy','reset')),
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  error TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  range_id BIGINT NOT NULL REFERENCES ranges(id) ON DELETE CASCADE,
  job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN ('info','warn','error')),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT NOT NULL REFERENCES users(id),
  team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
  range_id BIGINT REFERENCES ranges(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_ranges_team_id ON ranges(team_id);
CREATE INDEX idx_ranges_owner_user_id ON ranges(owner_user_id);
CREATE INDEX idx_ranges_status ON ranges(status);
CREATE INDEX idx_range_resources_range_id ON range_resources(range_id);
CREATE INDEX idx_jobs_status_created_at ON jobs(status, created_at);
CREATE INDEX idx_jobs_range_id ON jobs(range_id);
CREATE INDEX idx_events_range_id_created_at ON events(range_id, created_at DESC);
CREATE INDEX idx_audit_log_actor_user_id_created_at ON audit_log(actor_user_id, created_at DESC);
