---
name: gitmark
description: Anchor a repo's commits to Bitcoin as a trail of taproot spends, announce it on Nostr, and close the trail when the agent retires.
version: 1.0.0
author: melvincarvalho
uses: [txo, fund-agent]
---

# git mark

`git mark` spends the trail's current coin to a new address derived from the commit being marked. Each mark is a
real transaction, so a commit's existence at a point in time is provable from the chain alone. The trail lives in
`blocktrails.json` (committed) and in git notes; the current coin is in `git config gitmark.txo`; the key is
`git config nostr.privkey`, the same key the agent uses for Nostr.

## When to Use

- After `npm init agent` and `npx fund-agent`, to start a trail: `git mark init`.
- After any commit worth proving: `git mark`.
- To make the repo and its latest mark findable: `git mark announce`.
- When the agent retires, and only on the operator's word: `git mark exodus`, which sends the coin back to the
  address that funded it and closes the trail.

## The loop

```bash
npm init agent                  # key in git config
npx fund-agent                  # 10,000 sats to that key
git mark init                   # finds the coin at the key's address, starts the trail
git commit -m "my change"
git mark                        # one spend, 300 sat fee, HEAD is now on the chain
git add blocktrails.json && git commit -m "trail: mark"   # the trail file now records that mark
git push                        # if there is a remote: the state names HEAD, and mirrors fetch it from there
git mark announce               # NIP-34 announcement + repository state to the relays in git config nostr.relays
```

`git mark --announce` does the mark and the announce in one; `git config gitmark.announce true` makes that the
default. That is enough for the console. For a mirror that pulls on the state, keep the order above: commit the
trail file and push before announcing, so the state names a commit that the remote has and whose trail file
lists the mark.

## Commands

| Command | What it does |
|---------|--------------|
| `git mark init [--chain <id>] [--voucher txo:…]` | Start a trail. With no voucher it looks for a coin at the key's base address |
| `git mark [--announce] [--force]` | Mark HEAD. Refuses a commit that is already the last mark unless `--force` |
| `git mark info` | Chain, key, balance, marks, and whether the trail is closed |
| `git mark verify` | Check every mark against the chain |
| `git mark update` | Rebuild `blocktrails.json` from git notes (clean mode) |
| `git mark announce` | Publish the repo and its latest mark as a NIP-34 kind 30617 event, then the repository state (kind 30618: where each branch is) that mirrors pull on. Every remote becomes a clone tag |
| `git mark badge` | README badge markdown |
| `git mark exodus [address] [--dry]` | Close the trail: the coin goes back to the address that funded it, or to the address given; nothing left behind |
| `git mark --help` | Usage, from anywhere: `git mark announce --help` prints help and announces nothing. Any unknown word prints usage and exits 1 |

## Exodus: retiring an agent

A trail holds one coin. When the agent is done, the coin goes back to whoever funded it, and the trail is closed
so nothing can be marked under its name again.

```bash
git mark exodus --dry   # prints the transaction, broadcasts nothing: read it first
git mark exodus         # the whole balance less the 300 sat fee, back to the address that funded the trail
```

With no address, the coin goes back where it came from: the first input of the transaction that paid the
genesis coin, looked up on the explorer. Give an address to send it somewhere else. After exodus:

- the closing coin is in `git config gitmark.exodus`, a note under `refs/notes/exodus`, and `exodus` in
  `blocktrails.json`;
- `gitmark.txo` is unset, the agent's addresses hold no UTXOs;
- `git mark` and a second `exodus` refuse with "Trail is closed";
- `git mark info` shows the trail as closed with a balance of 0.

Exodus signs with the trail's own key, chained through every marked state. It never needs the funder's key.
Burning (BURN.md) is the older way and leaves a coin at the base address; exodus leaves none.

## Configuration

```bash
git config --local nostr.privkey <hex>        # the key; never print it, never commit it
git config --local gitmark.txo txo:…           # current coin, written by init and every mark
git config --local gitmark.dirty false         # clean mode: notes and config only, no file churn
git config nostr.relays "wss://…,wss://…"      # announce relays, comma or space separated
git config gitmark.announce true               # announce on every mark
GITMARK_EXPLORER=http://127.0.0.1:3491/api     # use another esplora-style API, such as a local explorer
```

Chains: `btc`, `tbtc3`, `tbtc4`, `signet` (mempool.space), `xbt` (Kilombino), `txbt4` (mempool.guide). The BLAKE2b
chains sign the unified sighash, so a mark cannot be replayed on the SHA256d chain.

## Security Notes

- `git mark` with no word is the mark command, not a status command: it spends 300 sats on HEAD. To look, use
  `git mark info`; to learn, `git mark --help`.
- 300 sats per mark; a 10,000 sat funding is about thirty marks. `git mark info` shows the balance.
- Run `exodus --dry` before `exodus`. The spend is irreversible and sends the whole balance.
- The announcement is public and signed by the agent key. Mark first, announce when ready.
- Announce last: after the mark, after committing `blocktrails.json`, after the push. The state event names
  HEAD; a mirror fetches that commit from the remote and reads the trail file at it. Announced before the push,
  the mirror finds nothing and holds.

## References

- [gitmark](https://github.com/solidpayorg/gitmark), [git-mark.com](https://git-mark.com)
- [the console](https://play-grounds.github.io/gitmark/), announced marks verified in the browser
- [fund-agent](https://github.com/blocktrails/fund-agent), the funding side
- [BURN.md](./BURN.md), closing a trail; [URI.md](./URI.md), the `txo:` form
