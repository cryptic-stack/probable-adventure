CREATE TABLE room_instances (
  id BIGSERIAL PRIMARY KEY,
  range_id BIGINT NOT NULL REFERENCES ranges(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','stopped','error')),
  entry_path TEXT NOT NULL,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (range_id, service_name)
);

CREATE INDEX idx_room_instances_range_id ON room_instances(range_id);
CREATE INDEX idx_room_instances_team_id ON room_instances(team_id);
CREATE INDEX idx_room_instances_status ON room_instances(status);
