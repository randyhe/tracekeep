export const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        external_id TEXT,
        completeness TEXT NOT NULL,
        sensitivity TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(type, external_id)
      );

      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id),
        text TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        sensitivity TEXT NOT NULL,
        created_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(source_id, content_hash)
      );

      CREATE TABLE evidence (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL REFERENCES captures(id),
        source_id TEXT NOT NULL REFERENCES sources(id),
        quote TEXT,
        locator TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE review_candidates (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL REFERENCES captures(id),
        candidate_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        sensitivity TEXT NOT NULL,
        outcome_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE open_loops (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 1,
        due_at TEXT,
        scheduled_for TEXT,
        source_id TEXT REFERENCES sources(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE decisions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT,
        source_id TEXT REFERENCES sources(id),
        created_at TEXT NOT NULL
      );

      CREATE TABLE reference_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT,
        source_id TEXT REFERENCES sources(id),
        created_at TEXT NOT NULL
      );

      CREATE TABLE audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        actor TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        schema_version INTEGER NOT NULL
      );

      CREATE TABLE outbox_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );

      CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
      END;
      CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
      END;
      CREATE TRIGGER outbox_events_no_update BEFORE UPDATE ON outbox_events BEGIN
        SELECT RAISE(ABORT, 'outbox_events is append-only');
      END;
      CREATE TRIGGER outbox_events_no_delete BEFORE DELETE ON outbox_events BEGIN
        SELECT RAISE(ABORT, 'outbox_events is append-only');
      END;

      CREATE TABLE idempotency_records (
        idempotency_key TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE search_documents USING fts5(
        entity_type UNINDEXED,
        entity_id UNINDEXED,
        source_id UNINDEXED,
        title,
        body,
        tokenize='unicode61'
      );

      CREATE INDEX idx_open_loops_status ON open_loops(status, due_at, priority);
      CREATE INDEX idx_reviews_status ON review_candidates(status, updated_at);
      CREATE INDEX idx_captures_source ON captures(source_id);
      CREATE INDEX idx_evidence_capture ON evidence(capture_id);
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE review_candidates ADD COLUMN outcome_action TEXT;
      ALTER TABLE review_candidates ADD COLUMN outcome_version INTEGER;
      ALTER TABLE open_loops ADD COLUMN deleted_at TEXT;
      ALTER TABLE open_loops ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'personal';
      ALTER TABLE decisions ADD COLUMN deleted_at TEXT;
      ALTER TABLE decisions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE decisions ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'personal';
      ALTER TABLE reference_items ADD COLUMN deleted_at TEXT;
      ALTER TABLE reference_items ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE reference_items ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'personal';

      UPDATE open_loops
        SET sensitivity = COALESCE((SELECT sensitivity FROM sources WHERE sources.id = open_loops.source_id), 'personal');
      UPDATE decisions
        SET sensitivity = COALESCE((SELECT sensitivity FROM sources WHERE sources.id = decisions.source_id), 'personal');
      UPDATE reference_items
        SET sensitivity = COALESCE((SELECT sensitivity FROM sources WHERE sources.id = reference_items.source_id), 'personal');

      CREATE TABLE open_loop_evidence (
        open_loop_id TEXT NOT NULL REFERENCES open_loops(id),
        evidence_id TEXT NOT NULL REFERENCES evidence(id),
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        PRIMARY KEY(open_loop_id, evidence_id)
      );

      CREATE INDEX idx_open_loop_evidence_active ON open_loop_evidence(open_loop_id, deleted_at);
      CREATE INDEX idx_open_loops_active_status ON open_loops(deleted_at, status, due_at, priority);
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE review_candidates ADD COLUMN knowledge_kind TEXT;
      ALTER TABLE review_candidates ADD COLUMN canonical_uri TEXT;
      ALTER TABLE reference_items ADD COLUMN knowledge_kind TEXT;
      ALTER TABLE reference_items ADD COLUMN canonical_uri TEXT;

      CREATE INDEX idx_review_candidates_knowledge_kind
        ON review_candidates(knowledge_kind, status, updated_at);
      CREATE INDEX idx_reference_items_knowledge_kind
        ON reference_items(knowledge_kind, created_at);
      CREATE INDEX idx_reference_items_canonical_uri
        ON reference_items(canonical_uri);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE tracekeep_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO tracekeep_settings(key, value, updated_at)
      VALUES ('auto_capture_enabled', 'true', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    `,
  },
] as const;
