# git mark

Anchor git commits to Bitcoin via [blocktrails](https://blocktrails.org) key chaining.

[![npm](https://img.shields.io/npm/v/gitmark)](https://npmjs.com/package/gitmark)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

## Install

```sh
npm install -g gitmark
```

This gives you `git mark` as a native git subcommand.

## Quick Start

```bash
# Initialize in a git repo (tbtc4 = Bitcoin testnet4)
git mark init --chain tbtc4 --voucher txo:tbtc4:txid:vout?amount=X&key=Y

# Or read vouchers from a file (uses last line, removes on success)
git mark init --voucher ~/faucet/vouchers.txt

# Or fund the key first (npx fund-agent, a faucet, any wallet) and init finds the coin
git mark init --chain txbt4

# Make commits, then mark them
git commit -m "my change"
git mark

# Verify the trail against Bitcoin
git mark verify

# Show trail state
git mark info
```

## Chains

Pick one with `--chain` at `git mark init`. It's recorded in `blocktrails.json` and used for every later mark.

| Chain | Network | Addresses | Explorer API |
|-------|---------|-----------|--------------|
| `tbtc4` (default) | Bitcoin testnet4 | `tb1p…` | mempool.space/testnet4 |
| `tbtc3` | Bitcoin testnet3 | `tb1p…` | mempool.space/testnet |
| `signet` | Bitcoin signet | `tb1p…` | mempool.space/signet |
| `btc` | Bitcoin | `bc1p…` | mempool.space |
| `xbt` | BLAKE2b fork of Bitcoin, from block 961,640 | `bc1p…` | mempool.kilombino.com |
| `txbt4` | BLAKE2b fork of testnet4, from block 150,308 | `tb1p…` | mempool.guide/testnet4 |

On `xbt` and `txbt4`, marks are signed with `SIGHASH_UNIFIED` ([spec](https://github.com/bitcoin-blake/blaketest/blob/gh-pages/unified-sighash.md)): a 65-byte signature ending `0x21` that Knots accepts on the BLAKE2b chains and SHA256d nodes reject. Coins from before the fork exist on both chains, so without this a mark could be replayed onto the original chain. `lib/unified-sighash.js` implements it and passes Knots's 166 test vectors (`test/unified_sighash.json`).

## How It Works

Each `git mark` creates a real Bitcoin transaction. The address is derived from your key + the commit hash using BIP-341 taproot key chaining:

```
baseKey + tweak(commit₁) → Address₁ → TXO₁
baseKey + tweak(commit₁, commit₂) → Address₂ → TXO₂
```

The chain of addresses on Bitcoin mirrors the chain of commits in git. Anyone can verify by re-deriving the addresses from the public key + commit hashes.

## Commands

| Command | Description |
|---------|-------------|
| `git mark init` | Initialize trail. Options: `--chain`, `--voucher`, `--force` |
| `git mark` | Anchor HEAD commit to Bitcoin. Options: `--announce`, `--force` (mark a commit that is already the last mark) |
| `git mark info` | Show trail state, balance, addresses |
| `git mark verify` | Verify all marks against Bitcoin |
| `git mark update` | Update blocktrails.json from git notes |
| `git mark badge` | Print README badge markdown. Option: `--branch` |
| `git mark announce` | Publish the repo and its latest mark to Nostr (NIP-34 kind 30617), then where each branch is (kind 30618) |
| `git mark exodus [address]` | Close the trail: send its coin back to the address that funded it (the first input of the genesis transaction), or to the address given; no trail output left. Option: `--dry` (print the transaction, broadcast nothing) |
| `git mark --version` | Show version |

## Announce

`git mark announce` publishes a NIP-34 repository announcement (kind 30617) signed with the trail key, so the
Nostr identity, the coin and the commit are one key. Besides the usual `d`, `name`, `clone`, `web` and branch
tags it carries the latest mark: `chain`, `txo` and `commit`. Relays come from git config, the convention
[git-nostr-hook](https://github.com/nostrapps/git-nostr-hook) uses:

```bash
git config nostr.relays "wss://relay.damus.io,wss://nos.lol"   # comma or space separated; defaults if unset
git mark --announce                                            # announce after this mark
git config gitmark.announce true                               # announce after every mark
```

Right after the announcement, the same key publishes the repository state (kind 30618): `d`, `HEAD`, one
`refs/heads/<branch>` tag per branch with its commit, and the mark again as `chain`, `txo`, `commit`. It is
replaceable, so the newest one from the trail key is where the repo is now; a mirror subscribes to it and
pulls when it changes, checking the named commit against the mark before trusting it. The output ends
`State: kind 30618 … (n/m relays)`.

A relay that refuses or times out is reported and never fails the mark.

## Badge

`git mark badge` prints markdown for a README badge, built from the `origin` remote, the current branch (or `--branch`) and `blocktrails.json`. For example, this is the badge for [melvincarvalho/delivery-day](https://github.com/melvincarvalho/delivery-day), whose trail is on txbt4:

[![gitmarks](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmelvincarvalho%2Fdelivery-day%2Fgh-pages%2Fblocktrails.json&query=%24.states.length&label=gitmarks&suffix=%20%C2%B7%20txbt4&color=f7931a)](https://mempool.guide/testnet4/tx/8129190799de150153bdae7d1092c4cd505874e842cfbf429ac452956025fa51)

It's a shields.io [dynamic JSON badge](https://shields.io/badges/dynamic-json-badge) that counts `states` in the pushed trail file, and links to the latest mark on the chain's explorer. The count updates whenever `blocktrails.json` is pushed, so it shows what the repo records. `git mark verify` checks it against the chain. For remotes not on GitHub, it prints `RAW_TRAIL_URL` and `TRAIL_LINK` placeholders to fill in.

## Trail File

`blocktrails.json` in your repo root — committed, visible, verifiable:

```json
{
  "version": "0.0.3",
  "profile": "gitmark",
  "pubkeyBase": "02abc...",
  "chain": "tbtc4",
  "states": ["a1b2c3", "e5f6a7"],
  "txo": [
    "txo:tbtc4:abc:0?commit=a1b2c3",
    "txo:tbtc4:def:0?commit=e5f6a7"
  ]
}
```

- **pubkeyBase** — compressed pubkey (02/03 prefix), base for BIP-341 key chaining
- **states** — commit hashes (input to key derivation)
- **txo** — Bitcoin anchors (TXO URIs, self-contained and verifiable)

Private spending state stored in `gitmark.txo` git config (never committed).

## Configuration

```bash
# Private key (auto-generated by init)
git config --local nostr.privkey <64-char-hex>

# Current UTXO (updated on each mark)
git config --local gitmark.txo txo:tbtc4:txid:vout?amount=X&commit=Y

# Dirty flag — set to false to keep working tree clean after marking
git config --local gitmark.dirty false
```

Every command that reads the chain uses the chain's explorer API (see Chains). `GITMARK_EXPLORER=http://127.0.0.1:3491/api` points them all at another esplora-style API, such as a local explorer.

When `gitmark.dirty=false`, `git mark` only writes git notes + git config. Run `git mark update` to sync blocktrails.json when ready.

Same secp256k1 key used for Nostr, Bitcoin, and Solid pod authentication.

## Dependencies

Two: `@noble/curves` and `@noble/hashes`. No bitcoinjs-lib, no external transaction builders.

## Related

- [blocktrails.org](https://blocktrails.org) — state anchoring on Bitcoin
- [git-mark.com](https://git-mark.com) — project homepage
- [BIP-341](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki) — Taproot key tweaking

## License

AGPL-3.0 &copy; Melvin Carvalho
