![image](https://github.com/solidpayorg/gitmark/assets/65864/09e421be-a3ce-4e4d-b2c2-e5c1be4ebb87)

## Introduction

Mark is the main function of gitmark.  It has a prerequisite on [GENESIS](./GENESIS.md) and
with these two oprations you are able to create robust git repos recorded in time, and 
identifiable globally.

## Chain follows repo

A mark is a marking of the underlying block chain with an on-chain committment

The transaction is tweeked with the new git hash, according to [CRYPTO](./CRYPTO.md)

In essense, this proves the chain is following the github repo and provides a timestamp server

## Repo follows chain

In order to create a two-way relationship the repo also follows the chain by recording the most recent
transaction object (txo) in a well known location.

## TXO well known location

The txo well known location is in the directory `.txo`

In there is a file txo.txt which is of the form:

```
<txo_uri> <balance>
```

The balance is an amount in satoshis

## Conclusion

In this way, the chain follows the repository, and the repository follows the chain, 
leading to a robust, auditable, time-stamping solution using Git and blockchains. 
This approach prevents double-spending by ensuring that the repository and the blockchain are in sync with each other.
