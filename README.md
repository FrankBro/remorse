# Remorse Chess

Chess where a capture leaves a guilt token (⛓) on the capturing piece. A guilty piece cannot capture until a friendly bishop is directly next to it (up, down, left or right) at the end of your turn. A bishop that captures clears its own guilt after one turn.

## Run
```
npm install
npm run dev      # play locally
npm test         # rules-engine unit tests
npm run build    # static site in dist/
```
Click "Create room", send the link to a friend, and play. Connections are peer-to-peer (PeerJS, using its free public broker), so there is no server of ours. It is not secure: the two browsers trust each other.

## Host for free
Upload `dist/` to GitHub Pages, Cloudflare Pages or Netlify. The build uses relative paths, so it works from a sub-path.
