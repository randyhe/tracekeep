# Security policy

## Supported version

Security fixes are applied to the latest published Tracekeep release.

## Reporting a vulnerability

Do not include private conversations, database files, access tokens, or Restricted content in a public GitHub issue. Use GitHub's private vulnerability reporting for this repository when available. If that channel is unavailable, open a public issue containing only a minimal, sanitized description and ask the maintainer for a private contact path.

Include the Tracekeep version, Windows version, reproduction steps using synthetic data, expected behavior, and observed behavior. Remove local paths, usernames, tokens, logs containing content, and screenshots containing personal information.

## Current security boundary

- Tracekeep is a single-user, local-first application.
- `tracekeepd` binds only to `127.0.0.1` and uses a local authentication token.
- The Windows release protects the token for the current user with DPAPI.
- Imported text, commands, and URLs are untrusted inert data and must never be executed or opened automatically.
- Restricted content must not appear in ordinary search, sanitized exports, logs, screenshots, CI artifacts, or the public repository.
- The installer does not request administrator rights, edit the registry, or create a Windows Firewall rule.
- Tracekeep does not silently enable cloud hosting, a paid AI provider, or an external write integration.

## Known limitations

- The release ZIP publishes a SHA-256 checksum but is not currently Authenticode-signed. Windows may show a security warning.
- Tracekeep data is protected by the Windows account and local device controls. Tracekeep does not provide application-level encryption for the SQLite database.
- Loopback binding prevents LAN exposure, but other processes running as the same local user may still be within the host trust boundary.
- ChatGPT Export imports store imported conversations locally for extraction, search, and source traceability. Users should import only data they are authorized to retain.
