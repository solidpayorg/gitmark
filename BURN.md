## Introduction

Burn is an optional garbage collection operation.  Burn is when you want to and a git mark tracking chain.

## Transaction

The best way to do this is to send vout 0 back to the orginal pubkey, creating a tweak of 0 which is impossible.

## Conclusion

This optional operation can clean up a chain and freeze it in time

## Exodus: closing a trail without leaving a UTXO

Burning leaves the coin sitting at the original pubkey. To close a trail and hand its coin back, for example to the fund-agent faucet that funded it, use exodus:

```bash
git mark exodus --dry             # show the transaction, broadcast nothing
git mark exodus                   # the trail coin back to the address that funded it
git mark exodus <address>         # or to an address of your choosing
```

The whole balance, less the 300 sat fee, goes to `<address>` in one output, and no trail output is left. The closing TXO is recorded in `git config gitmark.exodus`, as a note on the last marked commit under `refs/notes/exodus`, and as `exodus` in `blocktrails.json`. After that, `git mark` refuses to mark again.
