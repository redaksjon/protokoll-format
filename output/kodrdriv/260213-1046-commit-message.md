SUGGESTED_SPLITS:
Split 1:
Files: [src/migration.ts, scripts/migrate-transcripts.ts, scripts/inspect-pkl.ts]
Rationale: These files were modified together in a single work session and are logically related as they all deal with migration processes involving .pkl files.
Message: feat(migration): implement scripts for managing .pkl file migrations and inspections

Split 2:
Files: [scripts/cleanup-wal.ts]
Rationale: This file was modified in a separate work session and focuses solely on cleaning up .pkl files, which is a distinct functionality.
Message: feat(cleanup): add script to clean up WAL files associated with .pkl databases