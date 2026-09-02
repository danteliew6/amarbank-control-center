# AI Assistant Instructions

<!-- appkit-instructions-start -->
## Databricks AppKit

This project uses Databricks AppKit packages. For AI assistant guidance:

- **@databricks/appkit** (Backend SDK): [./node_modules/@databricks/appkit/CLAUDE.md](./node_modules/@databricks/appkit/CLAUDE.md)
- **@databricks/appkit-ui** (UI, Charts, Tables, SSE): [./node_modules/@databricks/appkit-ui/CLAUDE.md](./node_modules/@databricks/appkit-ui/CLAUDE.md)
<!-- appkit-instructions-end -->

## Deploy (this workspace is git-source only)

```bash
npm run build
databricks apps validate --profile fevm-dante-classic-stable
git add -f dist/server.js client/dist && git commit -m build && git push origin main
databricks apps deploy amarbank-control-center \
  --json '{"git_source":{"branch":"main","source_code_path":""}}' \
  --profile fevm-dante-classic-stable
```
