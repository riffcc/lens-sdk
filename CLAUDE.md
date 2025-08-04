# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

The Riff.CC Lens SDK is a TypeScript library for building decentralized applications using Peerbit (a P2P framework). It manages decentralized content including releases, categories, featured content, subscriptions, and blocked content with role-based access control.

## Common Commands

- **Build**: `pnpm build` - Cleans dist, generates TypeScript declarations, and bundles with esbuild
- **Test**: `pnpm test` - Runs Jest tests
- **Lint**: `pnpm lint` - Runs ESLint
- **Type Check**: `pnpm typecheck` - Validates TypeScript types
- **Run Single Test**: `pnpm test -- path/to/test.test.ts`

## Architecture

### Core Components

1. **Data Models** (`src/schema.ts`): Decorator-based classes using `@dao-xyz/borsh` for serialization
   - `Release`: Core content unit with name, category, CID, thumbnail
   - `Structure`: Unified data store for creating hierarchical groups (artists, TV shows, seasons, albums, playlists, etc.)
   - `Site`: Main program containing all stores and access controllers
   - Each model uses constants for property names (e.g., `RELEASE_NAME_PROPERTY`)

2. **Structure Data Store Design**:
   - A dedicated "structure" data store for creating groups that can be freely associated
   - Groups can be parent of, child of, or sibling of any other group
   - Used to associate groups with items (releases)
   - Example: A TV show structure might contain multiple season structures:
     ```json
     {
       "type": "season",
       "name": "Season 1",  // optional
       "order": 1,
       "parentId": "tv-show-id",
       "metadata": "{\"episodeCount\": 10}"
     }
     ```
   - Types include: `artist`, `series`, `season`, `album`, `playlist`, `collection`, `custom`
   - Single store handles all grouping needs instead of multiple dedicated stores

3. **Service Layer** (`src/service.ts`): 
   - `LensService`: Node.js implementation
   - `ElectronLensService`: Electron-specific implementation
   - Manages Peerbit client lifecycle and Site operations
   - All methods return consistent response types (`HashResponse`, `IdResponse`)

4. **Access Control**: Three role types with different permissions
   - `GUEST`: Read-only access
   - `MEMBER`: Can add/edit releases
   - `ADMIN`: Full control including delete

### Key Patterns

- **Property Constants**: All property names are defined as constants to avoid magic strings
- **Decorator-Based Serialization**: Uses `@variant()` and `@field()` decorators for data models
- **Lifecycle Management**: `new LensService()` → `init()` → `openSite()` → operations → `closeSite()` → `stop()`
- **Error Handling**: Consistent response objects with `success`, `id`/`hash`, and `error` fields
- **Replication Options**: Predefined configurations (`MEMBER_SITE_ARGS`, `ADMIN_SITE_ARGS`, `DEDICATED_SITE_ARGS`)

### Testing

Tests use real Peerbit instances and follow integration testing patterns. Always ensure proper cleanup in `afterAll` hooks when writing tests.