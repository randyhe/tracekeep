# Third-Party Notices

Tracekeep includes open-source packages distributed under their respective licenses. The Windows demo release contains the production dependency closure produced from the locked pnpm workspace and a bundled Node.js runtime.

Key runtime components include:

| Component | License | Project |
| --- | --- | --- |
| Node.js | MIT and bundled third-party notices | <https://nodejs.org/> |
| Fastify and `@fastify/static` | MIT | <https://www.fastify.io/> |
| React and React DOM | MIT | <https://react.dev/> |
| React Router | MIT | <https://reactrouter.com/> |
| better-sqlite3 | MIT | <https://github.com/WiseLibs/better-sqlite3> |
| SQLite | Public domain | <https://www.sqlite.org/copyright.html> |
| Zod | MIT | <https://zod.dev/> |
| Model Context Protocol TypeScript SDK | MIT | <https://github.com/modelcontextprotocol/typescript-sdk> |
| esbuild | MIT | <https://esbuild.github.io/> |

The source repository's lockfile records exact JavaScript package versions. A release must be rebuilt from that lockfile and reviewed for license changes before publication. Copyright notices and license texts shipped inside dependency packages remain applicable. This file is informational and does not replace those license texts.
