_"It takes 20 years to build a reputation and five minutes to ruin it. If you think about that you'll do things differently." -- Warren Buffett_

# gitmark

Gitmark extends git to allow commits to be "marked" (using the command `git mark`) by a supporting block chain. This "reinforces" or "finalizes" a given commit, to determine global consensus for the definitive project history

## Installation

```sh
sudo npm install -g gitmark
```

## Usage

```bash
git mark # marks the current commit

git mark [--genesis txoutput] # used for the genesis commit
```

## Introduction

Git mark, is an extension to the [marking](https://github.com/project-bitmark/marking/wiki) concept which aims to allow global distributed reputation trees to be grounded in a block chain. In this way you provide consensus on the definitive chain. Can ensure that the history has not been tampered with. Can reconstruct the current state from the history. And be used to save your reputation in time if any provider ceases to operate

Gitmark uses any git and provides a secure stamping chain to ensure the integrity of the definitive chain

Many thanks go to Peter Todd for his work on single use seals and Dr Maxim Orlovsky for his work on RGB

Gitmark is pre-alpha software, it should be considered experimental, and used at your own risk

## Getting started

Gitmark supports any block chains that have an argument for being provably fair. Gitmark does not support projects that are premines, instamines, ICOs, have developer taxes or provably unfair consensus such as proof of stake. As gitmark was designed for grounding reputation trees in the bitmark block chain, that is the first chain to be supported, it is also an inexpensive testing ground to get started. We also are supporters of the bitcoin project, however, that may be better suited to high value projects, as the software matures

The first prerequisite is to obtain an unspent transaction on a block chain. Recommended value to get started, experimentally, is 1 BTM. After that you send that value to an address for which you have the keypair. That becomes your genesis unspent transaction.

## Git mark

Running `git mark` on a repo will create your first marking

You will need a genesis address for the first run of the form `tx:output` and supply that with the argument --genesis [tx]

You will also need the private key from that tx, which is an argument to the gitmark script, but can be also saved in a location as directed by the output from the git mark command. Warning: do not use the default private key in the script!

Git mark will generate a new address to send to, a fee, an amount, a spending private key and unspent tx data as inputs to an rpc or a simple script `tx.sh` that lives in the bin directory

After running this script, an empty commit message is generated which you can check in, and points to the latest unspent transaction, creating a two way link

## How it works

Gitmark simply uses [single use seals](https://petertodd.org/2017/scalable-single-use-seal-asset-transfer) to tweak the initial public key address of the genesis transaction by the commit hash of the git tree. In this way the block chain points to git. It then points the next commit back to the block chain tx, creating two way link. Similarly the definitive git tree forms a chain of commits that go forward in time, and so do the new transaction on the block chain. Further commits are periodically marked in time proving an auditable trail in both time on-chain of the evolution of the git tree. It also shows the latest confirmed state of a git tree that can be used for trading or in safe or smart contracts

The first use case for gitmark is marking of reputation trees, but it can be applied to any git system where the history is important

## Recent git marks

- [Github](https://github.com/search?o=desc&q=%22gitmark+%22&s=committer-date&type=Commits)

## Related work

- [Single Use Seals](https://petertodd.org/2017/scalable-single-use-seal-asset-transfer)
- [RGB](https://rgb-org.github.io/)
- [Commerce Block Mainstay](https://www.commerceblock.com/mainstay/) [[White Paper](https://cloudflare-ipfs.com/ipns/ipfs.commerceblock.com/commerceblock-whitepaper-mainstay.pdf)]

## Source code

- [Source](https://github.com/solidpayorg/gitmark)

## License

MIT
