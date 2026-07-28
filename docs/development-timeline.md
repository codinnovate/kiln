# Development Timeline

Planning document for Kiln development phases and milestones.

## Overview

Kiln development follows four phases: Foundation, Completeness, Polish, and Release. Each phase builds on the previous one, with clear exit criteria.

## Phase 1: Foundation ✓

**Duration:** Completed
**Goal:** Core architecture and working prototype

### Milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| Project setup | Done | TypeScript 5.7, ESM, tsup, Vitest, ESLint, Prettier |
| Type system | Done | Core types in `src/models/provider.ts` and module-specific types |
| Provider abstraction | Done | `BaseProvider` abstract class, 6 implementations |
| Model registry | Done | 20+ models with metadata, aliases |
| Tool system | Done | `ToolRegistry`, `ToolHandler` interface, 15+ tools |
| Agent loop | Done | Streaming, tool dispatch, permission integration |
| Context engine | Done | Token estimation, repo scanning, budget management |
| Permission system | Done | Session + persistent approval, glob matching |
| Shell safety | Done | 4-level classification, pattern matching |
| Session persistence | Done | File-based storage, UUID naming |
| Configuration | Done | Global + project + env, Zod validation, credentials |
| CLI | Done | Commander-based, 8 commands |
| TUI | Done | React/Ink, streaming, interactive components |

### Exit Criteria
- All core modules compile and pass type checks
- Basic agent loop works end-to-end with at least one provider
- Tools execute and return results
- Configuration loads and merges correctly

---

## Phase 2: Completeness

**Duration:** In progress
**Goal:** Feature completeness and integration

### Milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| AGENTS.md loading | Pending | Auto-load from project root in agent loop |
| Compaction wiring | Pending | Connect `ConversationCompactor` to agent loop |
| Session resume | Pending | Resume from TUI with session ID |
| Error recovery | Pending | Retry logic for transient provider errors |
| TUI slash commands | Pending | Complete /compact, /context implementations |
| Model switching | Pending | Switch model mid-conversation |
| Debug mode | Pending | Verbose logging, request/response dumps |

### Exit Criteria
- AGENTS.md files are loaded and included in context
- Long conversations can be compacted automatically
- Sessions can be resumed from TUI
- Errors are handled gracefully with user feedback
- All slash commands work correctly

---

## Phase 3: Polish

**Duration:** In progress
**Goal:** Quality, performance, and documentation

### Milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| Test coverage | Pending | Unit tests for all modules, integration tests |
| Performance | Pending | Optimize token estimation, reduce context building time |
| Documentation | Done | API reference covering all 30+ public exports |
| CI/CD | Pending | GitHub Actions for lint, test, build, publish |
| Error messages | Pending | Clear, actionable error messages throughout |
| Edge cases | Pending | Handle empty projects, missing git, large files |

### Exit Criteria
- >80% test coverage
- No type errors or lint warnings
- All documentation complete
- CI pipeline passing
- Performance acceptable for projects with 10K+ files

---

## Phase 4: Release

**Duration:** Planned
**Goal:** Production-ready release

### Milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| Beta release | Pending | v0.9.0 on npm with beta tag |
| Beta feedback | Pending | Collect and address issues |
| Security audit | Pending | Review permission system, credential handling |
| v1.0.0 | Pending | Stable release |
| Post-launch | Pending | Monitor issues, rapid fixes |

### Exit Criteria
- Beta tested by multiple users
- No known critical bugs
- Security review complete
- Published to npm as v1.0.0

---

## Timeline Estimates

| Phase | Estimated Duration | Dependencies |
|-------|-------------------|--------------|
| Phase 1: Foundation | Completed | - |
| Phase 2: Completeness | 2-3 weeks | Phase 1 |
| Phase 3: Polish | 2-3 weeks | Phase 2 |
| Phase 4: Release | 1-2 weeks | Phase 3 |

**Total estimated time to v1.0.0:** 5-8 weeks from start

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Provider API changes | High | Medium | Abstract behind BaseProvider, pin SDK versions |
| Context window limits | Medium | High | Token budgeting, compaction, smart truncation |
| Permission system bypass | High | Low | Layered checks (tool + agent loop), blocked commands |
| TUI rendering issues | Low | Medium | Ink is stable, test on multiple terminals |
| Node.js version compatibility | Medium | Low | Target Node 18+, test on 18 and 20 |
| npm publishing issues | Low | Low | Use proven tsup config, test with `npm pack` first |

---

## Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-07-27 | ESM-only, no CommonJS | Modern Node.js, cleaner imports, tree-shaking |
| 2025-07-27 | React/Ink for TUI | Component model, streaming support, ecosystem |
| 2025-07-27 | Vitest over Jest | ESM support, faster, TypeScript-first |
| 2025-07-27 | Zod for validation | Runtime + static types from single source |
| 2025-07-27 | Hardcoded model registry | Avoid API calls at startup, deterministic |
| 2025-07-27 | File-based sessions | Simple, no database dependency, portable |
| 2025-07-27 | 4-level safety classification | Granular control without being overly restrictive |
