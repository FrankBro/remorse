# Remorse Chess

## Outcome
You and a friend open one link, join the same room, and play chess online. A piece that captures gets a guilt token that blocks further captures until a bishop cleanses it.

## Who it helps
You and a friend, who want to play a chess variant online. It is hosted for free, and security does not matter.

## What will change
A new browser game. One of you creates a room and shares the link. The other opens it. You then play chess in real time.

### Remorse rule (as understood, see open questions)
1. When a piece captures, a **guilt token** is placed on that piece. It moves with the piece.
2. A guilty piece **cannot capture** until the token is removed. It can still move normally.
3. **Cleansing:** at the end of a turn, if a friendly bishop is orthogonally adjacent (N/S/E/W, one square) to a guilty piece, that piece's token is removed.
4. **Bishop exception:** a bishop that captures removes its own token automatically after one turn.

## Acceptance checks
- A capture places a guilt token on the capturing piece, and the token follows that piece when it moves — unit: rules engine tests `#ac-guilt-placed`
- A guilty piece's capture moves are not offered and are rejected, while its non-capture moves still work — unit: rules engine tests `#ac-capture-blocked`
- A friendly bishop orthogonally adjacent to a guilty piece removes its token at the end of that turn, but a non-adjacent, diagonal or enemy bishop does not — unit: rules engine tests `#ac-cleanse`
- A bishop that captures has its own token removed automatically after one turn — unit: rules engine tests `#ac-bishop-self-cleanse`
- Standard chess still works with guilt applied: castling, promotion, en passant, check, checkmate and stalemate — unit: rules engine tests `#ac-standard-chess`
- Two separate browser windows join the same room by link and see each other's moves live, and only the player whose turn it is can move — e2e: two-window room `#ac-multiplayer`
- It needs no server code that we host, and the build output is a static folder suitable for free hosting — manual `#ac-static-build`

## Approach
- Static web app (TypeScript, Vite) with `chess.js` for standard chess rules and an existing board UI library. Remorse rules are layered on top of the move generator.
- Multiplayer via **PeerJS (WebRTC peer-to-peer)**, which uses a free public signalling broker. This avoids writing or paying for a server. The room link carries the host's peer id.
- Hosting on **GitHub Pages or Cloudflare Pages** (free). Nothing is deployed until you approve it.
- Fallback if peer-to-peer fails behind strict networks: a tiny free WebSocket relay, such as a Cloudflare Worker. It is only built if needed.
- Not secure on purpose: the clients trust each other.

## Decisions
- Free hosting with no server code of our own, using peer-to-peer rooms. The tradeoff is that a strict network may block connections, which the fallback covers.
- Reuse `chess.js` and an existing board UI instead of writing chess from scratch. You said libraries are fine.

## Open questions (defaults used if you don't answer)
1. "Orthogonal" bishop: adjacent only (default), or anywhere along a rank or file?
2. Does the cleansing bishop have to be the same colour as the guilty piece? Default: yes, friendly only.
3. When does cleansing happen? Default: at the end of the owner's own turn, with the bishop adjacent at that moment.
4. Can a guilty piece still give check? Default: yes, but it cannot capture. A guilty king cannot capture either.
5. If a side's only legal moves are blocked by guilt and it is not in check, it is stalemate. Default: legal moves are guilt-aware.
6. En passant counts as a capture and causes guilt. Default: yes.

## Evidence you will review
- The unit test run output (command, pass and fail counts) covering the rule checks.
- Screenshots of a guilt token being placed, a blocked capture, and a cleanse.
- A two-window playtest record with exact steps and what I observed.
- The build output listing.

None of this has been run yet. No results exist.

## Tasks
### Plan
- [~] Review this plan with the person `#plan-review`
### Build
- [ ] Scaffold the Vite and TypeScript app and add `chess.js` `#scaffold`
- [ ] Guilt-aware rules engine `#rules-engine`
  - [ ] Guilt tokens and capture block `#tokens`
  - [ ] Cleansing and bishop self-cleanse `#cleanse`
  - [ ] Guilt-aware legal moves and game end `#legal-moves`
- [ ] Board UI with guilt markers and legal-move highlights `#board-ui`
- [ ] PeerJS rooms: create, share link, join, sync moves, resign, rematch `#rooms`
- [ ] README with run and free-hosting steps `#readme`
### Test
- [ ] Unit tests for the rules engine `#unit-tests`
- [ ] Two-window playtest `#playtest`
### Review
- [ ] Person reviews the playable game `#outcome-review`
### Release
- [ ] Deploy to a free static host, only after your approval `#deploy`
