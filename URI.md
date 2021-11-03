# Gitmark URI Scheme

## Example

`gitmark:5e29f8f341c7a458c3b95693b3c9df4a6a5d8d120cd5cc720a49e5da6ed40c6d:0`

# Specifiction

The gitmark URI scheme comes in 4 parts

## Scheme

The scheme is 

`gitmark:`

## Transaction

The transaction correspods to a transaction on a blockchain following the bitcoin tx scheme

`gitmark:5e29f8f341c7a458c3b95693b3c9df4a6a5d8d120cd5cc720a49e5da6ed40c6d`

## Output

The output is the output on that transaction which is used in the git mark

The default is 0

`gitmark:5e29f8f341c7a458c3b95693b3c9df4a6a5d8d120cd5cc720a49e5da6ed40c6d:0`

# Notes

## Git commits
Gitmarks are also used in a git commit message, with an empty body, to mark the history

in a commit message a space was originally used instead of : so that would be supported in parsers

## Multi chain

Gitmark was designed to be prototyped on the bitmark chain.  But other chains will be supported.  A mechanism is not yet found but will be backward compatible with parsers

Supported chains, bitcoin, litecoin, liquid network

## Git tags

The : character is not available in a git tag, so if used in a tag a possible workaround may be needed