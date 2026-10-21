-- Repository yang dibatalkan tetap menyimpan histori bila sudah punya nilai.
alter type repo_status add value if not exists 'REVOKED';
