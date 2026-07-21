# Tracekeep Rename Migration

Tracekeep is the new name of the local-first memory and action product previously called Atlas. The rename changes the public product, package, plugin, skill, service, automatic-capture hook, and Windows release names. It does not rewrite user content or move a live database automatically.

## Current identifiers

- Product and plugin: `Tracekeep` / `tracekeep`
- Package scope: `@tracekeep/*`
- Service package: `@tracekeep/tracekeepd`
- MCP server: `tracekeep-memory-local`
- Environment variables: `TRACEKEEP_DATA_DIR`, `TRACEKEEP_PORT`, `TRACEKEEP_AUTH_TOKEN`, `TRACEKEEP_BASE_URL`, `TRACEKEEP_AUTO_CAPTURE`, and `TRACEKEEP_TOKEN`
- New Windows data directory: `%LOCALAPPDATA%\Tracekeep`
- New database file: `tracekeep.sqlite`

## Compatibility behavior

The service uses the following data-directory precedence:

1. An explicit data directory argument.
2. `TRACEKEEP_DATA_DIR`.
3. Legacy `ATLAS_DATA_DIR`.
4. `%LOCALAPPDATA%\Tracekeep` when it exists or no legacy directory exists.
5. Existing `%LOCALAPPDATA%\Atlas` as a non-destructive fallback.

Within the selected directory, `tracekeep.sqlite` is preferred. If it does not exist and `atlas.sqlite` does, Tracekeep opens the legacy database in place. Both `.tracekeepd.lock` and `.atlasd.lock` are held for the process lifetime to prevent an older Atlas process and Tracekeep from writing concurrently.

The legacy `ATLAS_PORT`, `ATLAS_AUTH_TOKEN`, `ATLAS_BASE_URL`, `ATLAS_AUTO_CAPTURE`, and `ATLAS_TOKEN` variables remain fallback inputs. The automatic-capture hook also reuses the legacy `%LOCALAPPDATA%\Atlas\plugin-data` retry queue when no Tracekeep queue exists. New tooling emits only the `TRACEKEEP_*` names.

## Deliberate exclusions

- Existing installed Atlas plugins or marketplaces are not silently removed.
- `%LOCALAPPDATA%\Atlas` and packaged `work/data` directories are never moved or deleted automatically.
- Existing GitHub releases retain their original asset names and checksums. A Tracekeep release must publish newly built assets.

Remove an old plugin registration only as a separate, explicit migration step after the Tracekeep build and installation have been verified. The GitHub repositories are named `randyhe/tracekeep-private` and `randyhe/tracekeep`.
