## Example workflow

1. Generate a [genesis](./GENESIS.md) address

2. For example from here: https://project-bitmark.github.io/brain/

3. Add funds to that address, from a faucet, from your coins, or by being marked

4. Grab the transaction id of your new funds, that's the genesis of the mark chain, and also id of the git mark repo

5. Commit your git tree

6. [Optionally] add a gitmark.json e.g.

```JSON
{
  "@id": "gitmark:b1fb9acb83f85887760b2e1a71e1df370976b1596be101bb0dbe8fd1c80f91cd:0",
  "genesis": "gitmark:b1fb9acb83f85887760b2e1a71e1df370976b1596be101bb0dbe8fd1c80f91cd:0",
  "nick": "myrepo",
  "package": "./package.json",
  "repository": "./"
}
```

7. Commit gitmark.json

8. Run:
```
git mark --genesis <txid:output>
```

9. Run the produced command to create a new tx

10. If successful you will get a tx output which can be used in a tag or in a new commit message: 

```
git commit --allow-empty "<txid:output>
```

You are done! 

You can now continue git marking as your project grows, and also push to whatever remotes that you have

Full workflow is here for illustration.  Some or all of these steps can be automated, to make it a one click process