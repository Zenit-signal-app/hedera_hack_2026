# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- `scripts/deploy-custom.sh` - New bash deployment script for Hedera-compatible EVM networks
- `deploy-vault.js --manager <address>` - Option to specify custom manager address

### Changed
- `deploy-vault.js` - Breaking changes:
  - Removed `--rpc-url` option (use `--network` or set in config)
  - Removed `--token1` and `--token2` options (must be in `vaultConfig.json`)
  - Removed `--max-shareholders` option (must be in `vaultConfig.json`)
  - Removed `--manager` override (use `--manager` option instead)
- `deploy-custom.sh` - Now configures unlimited auto-associations on deployment

### Removed
- `vault.md` - Documentation merged into README.md

### Fixed
- `deploy-custom.sh` - Added auto-association handling (was missing in initial version)
