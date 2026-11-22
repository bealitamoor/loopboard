# Sync plan

Each note carries a version vector. When two devices edit the same note offline, the newer sync detects the clash and
keeps both versions.

1. Detect: compare version vectors on upload.
2. Keep both: store the older edit as a sibling note.
3. Tell the user: show a small banner with a link to the sibling.
