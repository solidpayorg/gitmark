<div align="center">
  <h1>gitmark</h1>
</div>

<div align="center">  
Mark your git commits, to create global consensus, and a definitive project history
</div>

---

<div align="center">
<h4>Getting Started</h4>
</div>
  
---

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/solidpayorg/git-mark/blob/gh-pages/LICENSE)
![npm](https://img.shields.io/npm/v/gitmark)
[![npm](https://img.shields.io/npm/dw/gitmark.svg)](https://npmjs.com/package/gitmark)
[![Github Stars](https://img.shields.io/github/stars/solidpayorg/gitmark.svg)](https://github.com/solidpayorg/gitmark/)

## Introduction

Gitmark enhances git functionality by introducing the ability to 'mark' commits using the `git mark` command, integrating supported time chains (aka block chains). This process 'reinforces' or 'finalizes' specific commits, facilitating the establishment of a global consensus and creating a definitive, auditable, and tamper-proof history for a project. Git mark additionally solves the double spend problem for git repositories. Technical details are presented in the git mark [SCHEMA](./SCHEMA.md).

## Installation

```sh
sudo npm install -g gitmark
```

## Usage

```bash
git mark # marks the current commit

git mark [--genesis txoutput] # used for the genesis commit
```

## Motivation

Gitmark was originally created to facilitate the [marking](https://github.com/project-bitmark/marking/wiki) use case, which aims to allow global, distributed reputation trees to be grounded in a blockchain.

What is made possible, is a way to provide consensus on a definitive git branch/chain, in order to ensure that the history has not been tampered with

One can reconstruct the current state from the history, and this can also be used to preserve your reputation at any given time, say, if any provider ceases to operate

It's also possible to audit and verify the integrity of the git chain, to create a secure, finalized, state machine, with a definitive head, that is globally synced

The system can be extended beyond reputation trees, to use any git based store, and anchor it to a secure, verifiable chain of blocks, to determine the definitive history

Many thanks go to Peter Todd for his work on [single use seals](https://petertodd.org/2017/scalable-single-use-seal-asset-transfer) and Dr Maxim Orlovsky for his work on [RGB](https://rgb-org.github.io/)

_Gitmark is pre-alpha software, it should be considered experimental, and used at your own risk_

## Prerequisites

Because Gitmark was designed to anchor reputation trees, the reputation of the underlying blockchain must be unimpaired. Gitmark only supports blockchains that are provably fair. Bitcoin is regarded as the most secure and fairest of all blockchains, and should be used for high value projects where cost is not an issue.

Gitmark does not support projects that are premines, instamines, ICOs, have developer taxes or provably unfair consensus, such as proof of stake.

In solving the reputation use case, we aim to innovate in the space, contribute back code, and operate as a testing ground.

The first prerequisite is to obtain an unspent transaction on a supporting blockchain.

## Getting started

After you have obtained some blockchain currency, send those coins to an address for which you have the key pair. That becomes the genesis unspent transaction

Having created a genesis transaction, and recording the key pair safely, you are ready to start marking!

Install gitmark globally via npm, the executables will be in the bin directory which can be located with `which git-mark`

The genesis transaction provides the first input to the `git mark` command, and the private key (secret exponent in hex) is needed to advance the genesis transaction in line with the current git HEAD

## Git mark

Simply running `git mark` on a repo will create your first marking

You will need a genesis address for the first run of the form `tx:output` and supply that with the argument --genesis [tx]

You will also need the private key from that tx, which is an argument to the gitmark script, but can be also saved in a location as directed by the output from the git mark command. The key (ie 64 char hex secret exponent) should be stored in the indicated file with the json key "privkey"

_Warning: do not use the default private key, that is set, in the script!_

Git mark will generate a new address to send to, a fee, an amount, a spending private key and unspent tx data as inputs to an rpc or a simple script `tx.sh` that lives in the bin directory. Future versions will use a transaction builder to send to a network directly

After running this script, an empty commit message is generated which you can check in, and points to the latest new unspent transaction, creating a two way link. The commit message is a gitmark [URI](./URI.md)

Congratulations! You have now marked your first git repo!

See also: [Example Workflow](./WORKFLOW.md)

## How it works

Gitmark simply uses [single-use seals](https://petertodd.org/2017/scalable-single-use-seal-asset-transfer) to tweak the initial public key address of the genesis transaction by the commit hash of the git tree. The current git hash is added to the original, genesis public key in the output transaction, creating a chain of commits in the blockchain.

In this way, the blockchain points to git. It then points the next commit back to the blockchain tx, creating a two-way link, and therefore, a strong binding at one particular point in time.

Similarly, the definitive git tree forms a chain of commits that go forward in time, and so do the new transactions on the blockchain. Further commits are periodically marked in time, proving an auditable trail on-chain of the evolution of the git tree. It also shows the latest confirmed state of a git tree that can be used for trading or in safe or smart contracts.

The first use case for gitmark is marking reputation trees, but it can be applied to any git system where the history is important.

For more technical information take a look at [SCHEMA.md](./SCHEMA.md).

## Recent git marks

- [Github](https://github.com/search?o=desc&q=%22gitmark+%22&s=committer-date&type=Commits)

## Use Cases

- Distributed Reputation Trees
- Distributed Ledgers
- Registries
- Safe or Smart Contracts
- Asset Issuance
- Distributed Exchanges
- Reconstruct histories from Genesis
- Distributed Global Consensus
- Domain independent web sites
- Archiving and Time Travel through History
- Distributed Identity and PKI
- Federated Side Chains
- Auditing Histories
- Fraud Detection
- Supply Chains

## Related work

- [Single Use Seals](https://petertodd.org/2017/scalable-single-use-seal-asset-transfer)
- [RGB](https://rgb-org.github.io/)
- [Commerce Block Mainstay](https://www.commerceblock.com/mainstay/) [[White Paper](https://cloudflare-ipfs.com/ipns/ipfs.commerceblock.com/commerceblock-whitepaper-mainstay.pdf)]
- [BIP 175 - Pay to Contract Protocol](https://github.com/bitcoin/bips/blob/master/bip-0175.mediawiki)
- [LRC-20](https://github.com/akitamiabtc/LRC-20/blob/main/LRC_20_V0.1.pdf)

## Source code

- [Source](https://github.com/solidpayorg/gitmark)
- [Issue Tracker](https://github.com/solidpayorg/gitmark/issues)
- [NPM](https://www.npmjs.com/package/gitmark)

## Future work

- Git marks can be extended to further layers by using git submodules hence creating almost unlimited space

- Private git repositories can be supported out of the box, and given that private keys are used in each seal, encrypted backups can be made

- The project git tree can be backed up or archived using git clone in multiple locations. It is natural that popular projects are cloned often in any case

- Seals can be opened and closed using a federation, in order to try out multiple consensus and verification methods

- More robust verification frameworks can be built using node testing frameworks, and continuous integration, tho currently the distribution contains a git-mark-verify script

- Lightweight Autonomous Marking Agents (LAMAs) can be created that listen to communities for marks and just work, without needing a human operator. The service can be deployed on a server or container, and be designed to bring itself up if it goes down in any one location

## License

- MIT
