# Image-upload DEV candidate: frontend dependency review

The 2026-11-03 full frontend audit identified vulnerable DOMPurify and Zod
versions used by the DEV document viewer. The candidate updates DOMPurify to
3.4.17 and Zod to 4.6.7. The viewer's transitive `pptx-viewer-mcp` and
`ooxml-core` are temporarily pinned to 2.7.1 and 0.14.0: both satisfy the
parent ranges and accept the patched Zod while retaining one shared
`yjs@13.6.32` and `lib0@0.2.117`. The newer compatible minor branch otherwise
introduced a second Yjs version. Remove or update these temporary overrides
when an upstream viewer dependency supports a single compatible Yjs and the
patched security dependencies; rerun the complete audit, document-viewer and
two-actor collaboration acceptance before doing so.

Jenkins web build 407 exhausted its 3 GiB Node container while bundling the
DEV viewer, despite the 2 GiB V8 heap limit. The DEV web pipeline reserves
2 GiB and limits that container to 4 GiB so the scheduler accounts for the
build and Node/esbuild have native-memory headroom. A repeated native build
and CI node resource observation remain required.

The fresh full DEV audit reports 18 moderate and two high findings. The two
high findings are `body-parser@2.3.0` in the viewer's MCP tooling and Vite
6.4.3/7.3.6 in build/test tooling. Rendered browser-module inventory found no
modules from any of the reported packages in the web output. The web image
copies nginx configuration and the built static output, not Node modules. The
server-side game adapter copies only its own compiled output, Playwright Core,
Sharp, Detect Libc, @img and the game-sync SDK. The full audit and inventory
remain outside Git as candidate-specific evidence. A native image inventory,
fresh JVM gate and actual DEV acceptance are still required before delivery.

The reviewed lockfile SHA-256 is
`1fadfab60077068bfb190cdd1bfbe523e93974fae142e6248a7b3ec2c5295148`.
The full audit and rendered-module inventory are preserved under
`hotfix-results/image-upload-413-20261103/` in the workspace; their hashes
are recorded alongside them. Recompute the evidence for any lockfile change.

The outside-server-runtime finding policy does not classify these issues as
fixed or false positives. Unknown runtime membership, failed scans or new
findings block publication.
