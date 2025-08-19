# Maintenance scripts

## merge_hbuk.js

One-time merge tool to copy data from the legacy `hbuk_db` database into the canonical `hbuk` database, de-duping users by email and remapping `entries.userId`.

- Location: `scripts/maintenance/merge_hbuk.js`
- Manual use only. Not wired into app startup or CI.
- Requires `mongodb` Node driver (already in dependencies).

### Dry run (no writes)

```bash
MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/" \
SOURCE_DB="hbuk_db" TARGET_DB="hbuk" DRY_RUN=1 \
node scripts/maintenance/merge_hbuk.js
```

Or via npm:

```bash
npm run merge:dry
```

### Real run

```bash
MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/" \
SOURCE_DB="hbuk_db" TARGET_DB="hbuk" \
node scripts/maintenance/merge_hbuk.js
```

Or via npm:

```bash
npm run merge:run
```

### Notes
- Do not commit credentials or `.env` files.
- After merging, keep the backend pointed to `MONGODB_DB_NAME=hbuk` only.
- Optionally back up/rename the old DB (e.g., `hbuk_db_backup_YYYY_MM_DD`).
