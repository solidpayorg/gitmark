## Genesis

The genesis transaction output starts the chain of marks in git mark

In order to start marking you will need a genesis transaction output

This will also have a public address and a private key (secret exponent)

You will need the transaction id and the secret exponent to start git marking

One way to save the secret exponent is in git

```
git config gitmark.secret <secretexponent>
```

This is not terribly secure, but for small projects to get started it is convenient

A useful way to generate an address and secret exponent would be:

https://project-bitmark.github.io/brain/

Use a very secure password for anything more than testing

Once you have an address, send some coins there from a faucet, a friend, or by being marked

The genesis id also doubles as the @id for a gitmark project

Optionally it can be added a file, `gitmark.json` in the root directory of your repo

It may look like this:

```JSON
{
  "@id": "gitmark:b1fb9acb83f85887760b2e1a71e1df370976b1596be101bb0dbe8fd1c80f91cd:0",
  "genesis": "gitmark:b1fb9acb83f85887760b2e1a71e1df370976b1596be101bb0dbe8fd1c80f91cd:0",
  "nick": "myrepo",
  "package": "./package.json",
  "repository": "./"
}
```

Once you have your genesis tx, you can make your first git mark by running, for example:

```
git mark --genesis b1fb9acb83f85887760b2e1a71e1df370976b1596be101bb0dbe8fd1c80f91cd:0
```

Do this after you have commited your first files, and as recommended a gitmark.json file too