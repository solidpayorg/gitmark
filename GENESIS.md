## Genesis

### Prerequisites 

The genesis transaction output starts the chain of marks in git mark

In order to start marking you will need a genesis transaction output aka uxto

This will also have a public address and a private key (secret exponent)

You will need the **transaction output id** and the **private key** to start git marking

### Storing Secrets

One way to save the secret exponent is in git

```
git config gitmark.secret <secretexponent>
```

This is not terribly secure, but for small projects to get started it is convenient.  An article on trade offs of this approach is presented here [here](https://withblue.ink/2021/05/07/storing-secrets-and-passwords-in-git-is-bad.html)

A useful way to generate an address and secret exponent would be:

https://project-bitmark.github.io/brain/

Use a very secure password for anything more than testing

### Funding

Once you have an address, send some coins there from a faucet, a friend, or by being marked

The genesis id also doubles as the @id for a gitmark project


### Gitmark.json

Optionally a file can be added, `gitmark.json`, in the root directory of your repo

It may look like this:

```JSON
{
  "@id": "gitmark:59ff24db0321cb6b32a404815345b00ae68ca8b81150fbea6464ee10557e0fae:1",
  "genesis": "gitmark:59ff24db0321cb6b32a404815345b00ae68ca8b81150fbea6464ee10557e0fae:1",
  "nick": "myrepo",
  "package": "./package.json",
  "pubkey": "7574866ae7653e084c3c8e9e6359660e2c728d249fefb0f984bd32393f2ac67f",
  "repository": "./"
}
```

- **@id** is the unstpent transaction output
- **genesis** points to the same transaction output
- **nick** is a short name e.g. as used in npm
- **package** points to a package.json info
- **pubkey** is the pubkey for the genesis tx, in hex
- **reposity** is an absolute or relative hint as to where to find the git code


### First git mark

Once you have your genesis tx, you can make your first git mark by running, for example:

```
git mark --genesis b1fb9acb83f85887760b2e1a71e1df370976b1596be101bb0dbe8fd1c80f91cd:0
```

Do this after you have commited your first files, and as recommended a gitmark.json file too


### Notes on Commits

The commit requires a name, email and commit message, with opional signing.

The **name** can be whatever you want

The **email** is open, but you can select a noreply addess to indicate privacy, such as noreply@<genesis-hash>.gitmark
  
The **commit message** can be anything, and will be the first commit ready to be marked.  e.g. "first"

### Notes on .gitmark   

The .gitmark address is just a place holder if it is undesirable to enter a public email address.  In future it may be possible to resolve .gitmark urls to a working github repository and deployments
  
