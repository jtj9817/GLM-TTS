# Web Service Migration Plan

Goal: extract the web UI/service into a separate repo, add a provider interface with a GLM-TTS adapter, and load a config-driven backend registry. Backend selection is per session. No auth is required between web service and backends (local usage). The UI should expose clear_cache only when the selected backend supports it.

## Scope and assumptions
- The new web repo continues to use Bun, React, and the existing /api/* routes as the UI integration surface.
- The Python GLM-TTS server remains a separate process and is not moved into the web repo.
- Local persistence (SQLite + audio files in web/data) remains in the web service for now.
- Capability schema should remain generic and extensible (not tailored to any single backend).

## Phase 0: Alignment and prep
- Create a new repository for the web service (e.g., glmtts-web).
- Move the current web/ directory into the new repo, excluding node_modules and dist.
- Update the README to describe environment variables, the backend registry config, and how to run locally.

## Phase 1: Define the provider contract
- Define a normalized request/response interface for synthesis requests.
- Define a provider interface with methods:
  - health()
  - synthesize(request)
  - capabilities()
  - clearCache?() (optional)
- Define a capability schema that can describe input requirements, supported settings, and audio formats.

## Phase 2: Config-driven backend registry
- Add a registry loader that reads from a JSON config file.
- Config file location:
  - TTS_BACKENDS_CONFIG (default to ./config/backends.json)
- Default backend selection:
  - DEFAULT_TTS_BACKEND (fallback to the registry default)
- Registry entries should include at least:
  - id, type, label, base_url, timeout_ms
- If no registry config is found, auto-register a default GLM-TTS backend using GLMTTS_API_BASE for backward compatibility.

## Phase 3: GLM-TTS adapter
- Implement a GLM-TTS provider adapter that maps to:
  - GET /health
  - GET /clear_cache
  - POST /synthesize (form-data)
- Preserve current default settings and field names to keep behavior identical.
- Normalize errors and propagate useful messages to the web API layer.

## Phase 4: Web API integration
- Route handlers delegate to the selected provider from the registry.
- Session-scoped backend selection:
  - Store selected backend id in the session record or session cookie data.
  - Add an API endpoint to set the active backend (e.g., POST /api/backends/select).
- Add endpoints for backend discovery:
  - GET /api/backends
  - GET /api/backends/:id/capabilities
- Ensure /api/clear_cache is only exposed when the selected provider supports clearCache.

## Phase 5: UI changes
- Add a backend selector that stores the selection per session.
- Update settings UI to use backend capabilities to enable/disable fields.
- Hide or disable clear_cache controls when the backend does not support it.

## Phase 6: Storage and data migration
- Keep the SQLite database and audio files in web/data.
- Document how to copy web/data from the old repo if users want to preserve history.

## Phase 7: Testing and validation
- Unit tests for registry loading and provider interface compliance.
- Integration tests for /api/synthesize, /api/backends, /api/backends/:id/capabilities.
- Manual validation:
  - Start GLM-TTS server, start web service, synthesize audio, download, and delete.
  - Switch backends in session and confirm UI updates.

## Phase 8: Cutover
- Update GLM-TTS repo docs to point to the new web repo and its run instructions.
- Keep the old web/ folder temporarily for rollback, then remove after verification.

## Implementation checklist
- [ ] Create the new web repository and move web/ contents into it.
- [ ] Add provider interface definitions (types + errors).
- [ ] Implement config-driven backend registry with validation.
- [ ] Implement GLM-TTS provider adapter.
- [ ] Update API routes to use the provider and session-scoped backend selection.
- [ ] Add /api/backends and /api/backends/:id/capabilities endpoints.
- [ ] Update UI to select backend per session and honor capabilities.
- [ ] Make clear_cache conditional on backend support.
- [ ] Add/adjust tests for registry and providers.
- [ ] Update README and usage docs in both repos.
- [ ] Document data migration for web/data.
- [ ] Perform manual validation and note results.
