## Funding & State Contract

How a gitmark repo gets funded, where its state lives, and which tool owns
which field. This is the contract that [GENESIS](./GENESIS.md) and
[MARK](./MARK.md) operate against, and that
[fund-agent](https://github.com/blocktrails/fund-agent) must align to.

The guiding rule: **clean by default, publish by switch**, and **two funding
roles that are never confused for each other**.

> **Status: current.** This doc describes the modern (0.0.77+, blocktrails)
> design — config + git-notes state, `blocktrails.json` trail. Some older
> operation docs predate this and are being modernized step by step; where they
> disagree with this contract, this contract is the current one. References
> below are to *operations* (which map to real commands today), not to the older
> prose around them.

---

## Two state modes

State splits on one question: *does it touch the committed working tree?*

### Clean (the default)

State lives where git already keeps non-tree data:

- **`git config` (local)** — the private, operational pointers
  (`nostr.privkey`, `gitmark.network`, `gitmark.txo`). Never committed.
- **`git notes`** — the per-commit trail entry. Pushable
  (`refs/notes/*`), so the history still travels with the repo and verifies,
  without leaving anything in the working tree.

Any repo can be anchored this way without adding a single file to it. This is
the mode you want for an ordinary code repo you're merely timestamping.

### Publish (opt-in, `--in-repo` / `--publish`)

*Additionally* writes committed files:

- **`blocktrails.json`** — the canonical, human-readable, verifiable trail.
- **`.well-known/txo/txo.json`** — the funding ledger, servable over HTTP
  (RFC 8615).

These are **serializations for outside consumers**, not the source of truth —
the source of truth is always the config + notes + the chain itself. Use this
mode when you actually want the trail visible or servable: a published soul, a
`gh-pages` site, a `.well-known` endpoint.

> Today both gitmark and fund-agent behave as if `--publish` were always on,
> because the switch has not been added yet. The fix is to make the file writes
> conditional and default them off.

---

## Two funding roles

These are **two different things with different lifecycles** — not two names for
one value. Keeping them distinct is what makes the producer/consumer split
clean.

| | `nostr.voucher` | `gitmark.txo` |
|---|---|---|
| **Role** | bootstrap — fund a fresh repo | the running tip — what the next MARK spends |
| **Lifecycle** | transient; consumed once at GENESIS | updated on every MARK |
| **Form** | bearer voucher (`&key=`) — spendable cash | self-reference (`&pubkey=`) — spendable only by `nostr.privkey` |
| **Namespace** | `nostr.*`, beside `nostr.privkey` (a soul-bootstrap credential) | `gitmark.*` (the tool's operational state) |
| **Owned by** | **fund-agent** (writes it) | **gitmark** (manages it) |

### `nostr.voucher` — bootstrap

A faucet handout that gets a brand-new repo its first sats. It carries a
spendable key (`&key=`), so it is bearer value — as sensitive as
`nostr.privkey`, and like it, **local only, never `--global`**. fund-agent's job
ends once it has written this (and the key) into the new repo.

### `gitmark.txo` — the running tip

The latest unspent output on the repo's *own* key — the head of the mark chain.
Each [MARK](./MARK.md) spends it and records the new output back into
`gitmark.txo`. Because it references the repo's own key by pubkey (not a bearer
key), publishing it is safe.

> **Why `txo`, not `utxo`** — the value is a `txo:` URI, consistent with the
> rest of the stack (`.well-known/txo/txo.json`, the `txo:` scheme,
> `txo_parser`). The field always holds the *current unspent* tip, but that is
> an invariant of the role, not something the name needs to restate. (If the
> name had to scream its role, `gitmark.tip` would beat `utxo` — but consistency
> wins; keep `txo`.)

---

## The seam: GENESIS

The two roles meet at exactly one point, and only one:

> **`git mark init` (GENESIS) reads `nostr.voucher`, sweeps it onto the repo's
> own key, and seeds the first `gitmark.txo`.**

After that, gitmark owns the tip. `nostr.voucher` has done its job and is spent;
fund-agent never touches `gitmark.txo`, and gitmark never re-reads the voucher.

```
  fund-agent                 gitmark
  ──────────                 ───────
  fund the key      ┐
  write nostr.voucher├──► git mark init (GENESIS)
  (bearer, &key=)   ┘         │  sweep voucher
                              ▼
                          gitmark.txo  ◄──┐  (self-ref, &pubkey=)
                              │           │
                              ▼           │
                          git mark (MARK)─┘  spend tip → record new tip
```

---

## Division of labour

- **fund-agent** owns **bootstrap**: fund the key, write `nostr.voucher`. It does
  not need to know `gitmark.txo` exists.
- **gitmark** owns **the tip**: GENESIS seeds `gitmark.txo` from the voucher;
  every MARK advances it. In `--publish` mode it also serializes the trail to
  `blocktrails.json` / `.well-known/txo/txo.json`.

This keeps each tool inside its own config namespace, with a single, explicit
handoff field between them.

---

## Safety

- **Local only, never `--global`.** Both `nostr.privkey` and `nostr.voucher` are
  per-repo secrets; a `--global` write would clobber another repo's soul.
- **`nostr.voucher` is bearer value.** Treat the `&key=` string like cash; never
  commit it, never publish it. Only `gitmark.txo` (the `&pubkey=` self-reference)
  is safe to expose.
- **Clean mode commits nothing.** `--publish` is the only mode that writes files
  into the tree — so publishing the trail is always a deliberate choice.

---

Related operations: **GENESIS** (`git mark init`) seeds the tip; **MARK**
(`git mark`) advances it. The op-specific docs are being modernized to match this
contract.
