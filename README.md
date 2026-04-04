# git mark

Anchor git commits to Bitcoin via [blocktrails](https://blocktrails.org) key chaining.

[![npm](https://img.shields.io/npm/v/gitmark)](https://npmjs.com/package/gitmark)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Install

```sh
npm install -g gitmark
```

This gives you `git mark` as a native git subcommand.

## Quick Start

```bash
# Initialize in a git repo (tbtc4 = Bitcoin testnet4)
git mark init --chain tbtc4 --voucher txo:tbtc4:txid:vout?amount=X&key=Y

# Make commits, then mark them
git commit -m "my change"
git mark

# Verify the trail against Bitcoin
git mark verify

# Show trail state
git mark info
```

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
| `git mark` | Anchor HEAD commit to Bitcoin |
| `git mark info` | Show trail state, balance, addresses |
| `git mark verify` | Verify all marks against Bitcoin |

## Trail File

`blocktrails.json` in your repo root — committed, visible, verifiable:

```json
{
  "version": "0.0.3",
  "profile": "gitmark",
  "publicKeyBase": "02abc...",
  "chain": "tbtc4",
  "states": ["a1b2c3", "e5f6a7"],
  "txo": [
    "txo:tbtc4:abc:0?commit=a1b2c3",
    "txo:tbtc4:def:0?commit=e5f6a7"
  ]
}
```

- **publicKeyBase** — compressed pubkey (02/03 prefix), base for BIP-341 key chaining
- **states** — commit hashes (input to key derivation)
- **txo** — Bitcoin anchors (TXO URIs, self-contained and verifiable)

Private spending state stored in `.git/blocktrails.json` (never committed).

## Key Storage

Your private key is stored in git config:

```bash
git config nostr.privkey <64-char-hex>
```

Same secp256k1 key used for Nostr, Bitcoin, and Solid pod authentication.

## Dependencies

Two: `@noble/curves` and `@noble/hashes`. No bitcoinjs-lib, no external transaction builders.

## Related

- [blocktrails.org](https://blocktrails.org) — state anchoring on Bitcoin
- [git-mark.com](https://git-mark.com) — project homepage
- [BIP-341](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki) — Taproot key tweaking
- [Single-use seals](https://petertodd.org/2017/scalable-single-use-seal-asset-transfer) — Peter Todd

## License

MIT
