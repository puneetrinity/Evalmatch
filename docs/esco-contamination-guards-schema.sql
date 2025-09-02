-- ESCO Contamination Guards Schema
-- This schema matches the usage in server/lib/esco-service.ts lines 268-304
-- Used for filtering contaminated skills from ESCO skill extraction results

CREATE TABLE IF NOT EXISTS contamination_guards (
  id INTEGER PRIMARY KEY,
  guard_name TEXT NOT NULL,           -- Human-readable name for the guard rule
  pattern TEXT NOT NULL,              -- Regex pattern to match against skill titles
  allowed_contexts TEXT NOT NULL,     -- CSV list of contexts where the skill is allowed
                                     -- Example: "programming,development,software"
  blocked_domains TEXT NOT NULL,      -- CSV list of domains where the skill is blocked
                                     -- Example: "pharmaceutical,auto"
  severity TEXT DEFAULT 'medium',     -- Guard severity level (low, medium, high, critical)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Example contamination guard entries
-- These prevent common false positives like single letters matching programming languages

INSERT OR IGNORE INTO contamination_guards (guard_name, pattern, allowed_contexts, blocked_domains) VALUES
  ('Single Letter R Guard', '^R$', 'programming,statistical,data,analysis,development', 'pharmaceutical,auto,general'),
  ('Single Letter C Guard', '^C$', 'programming,development,software,systems', 'pharmaceutical,auto,general'),
  ('JavaScript Contamination', 'javascript', 'technology,programming,web,development', 'pharmaceutical,auto'),
  ('Python Contamination', 'python', 'technology,programming,data,development', 'pharmaceutical,auto'),
  ('API General Term', '^API$', 'programming,integration,development,software', 'pharmaceutical,auto');

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_contamination_guards_pattern ON contamination_guards(pattern);