# Release checklist

Mark each line pass, fail, or `[fill: owner]` if only a person can do it. Adapt to the project; delete lines that do
not apply and say so.

## Before the tag

- [ ] Working tree clean; on the release branch; up to date with the remote.
- [ ] Every `merged` row has a commit or PR; no unmatched commits left unexplained.
- [ ] Test suite passes (command and result noted).
- [ ] Lint and type-check pass.
- [ ] Production build succeeds from a clean checkout.
- [ ] Secret scan on the diff since the last tag finds nothing (keys, tokens, `.env`, private URLs, home paths).
- [ ] Dependencies: no new ones without a reason; licenses compatible; audit output read.
- [ ] Version bumped in every place the project keeps it (manifest, lockfile, docs, plugin metadata).
- [ ] `CHANGELOG.md` entry written, dated, plain language.
- [ ] Migrations, config changes, feature flags and new environment variables listed in the ledger.
- [ ] Rollback plan written and plausible.
- [ ] Docs and README match the new behaviour.

## Tag and publish (user's go required)

- [ ] Annotated tag created with the project's naming scheme.
- [ ] Tag and branch pushed.
- [ ] Release notes published where the project publishes them.
- [ ] Artifacts built and uploaded by the project's release job, if any.

## After

- [ ] Smoke test of the released build.
- [ ] Rows set to `released`/`done`; `## Done recently` and `updated:` refreshed.
- [ ] Known issues from the ledger copied into the board as new rows.
- [ ] Next version's changelog heading opened, if the project keeps an "Unreleased" section.
