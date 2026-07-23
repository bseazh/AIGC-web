# PostgreSQL Backup And Recovery

## Protection In Place

- A local PostgreSQL backup is created daily at approximately 03:30 CST.
- Each backup is uploaded to the private COS prefix `backups/postgres/`.
- Local backups are retained for 14 days. COS lifecycle retains remote backups for 30 days.
- A temporary-database restore verification runs weekly on Sunday at approximately 04:00 CST.

## Check Backup Health

```bash
sudo systemctl status aigc-postgres-backup.service --no-pager
sudo systemctl status aigc-postgres-restore-verify.service --no-pager
sudo journalctl -u aigc-postgres-backup.service -n 50 --no-pager
sudo journalctl -u aigc-postgres-restore-verify.service -n 50 --no-pager
```

## Restore Procedure

1. Put the selected `.sql.gz` backup in `/home/ubuntu/backups/aigc-postgres/`.
2. Stop the web and worker services to prevent writes.
3. Restore to a separate verification database first. The weekly verification script is the reference implementation.
4. Only after verifying tables and application access, arrange an approved production cutover.
5. Restart the web and worker services, then verify `http://127.0.0.1:3010/api/health/`.

Never restore directly over the production `aigc` database without an approved maintenance window and a fresh backup of the current database.

## Recovery Targets

- Local recovery: `/home/ubuntu/backups/aigc-postgres/`
- Disaster recovery: private COS prefix `backups/postgres/`
- Health endpoint: `http://127.0.0.1:3010/api/health/`
