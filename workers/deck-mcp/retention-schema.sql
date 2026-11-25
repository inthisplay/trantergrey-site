CREATE INDEX IF NOT EXISTS oauth_records_client_reference
ON oauth_records(json_extract(data,'$.clientId'),expires_at);
