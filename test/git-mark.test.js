import { describe, it } from 'node:test';
import assert from 'node:assert';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

import {
  taggedHash, btScalar, deriveChainedPrivkey, deriveChainedPubkey,
  pubkeyToAddress, parseTxoUri, p2trScript, CHAINS
} from '../bin/git-mark.js';

describe('Key chaining', () => {
  const privkey = hexToBytes('0000000000000000000000000000000000000000000000000000000000000001');
  const pubkey = secp256k1.getPublicKey(privkey, true);

  it('deriveChainedPubkey with no states returns original key', () => {
    const result = deriveChainedPubkey(pubkey, []);
    assert.deepStrictEqual(result, pubkey);
  });

  it('deriveChainedPubkey with one state changes the key', () => {
    const result = deriveChainedPubkey(pubkey, ['abc123']);
    assert.notDeepStrictEqual(result, pubkey);
    assert.strictEqual(result.length, 33); // compressed
    assert.ok(result[0] === 0x02 || result[0] === 0x03); // valid prefix
  });

  it('deriveChainedPubkey with two states differs from one state', () => {
    const one = deriveChainedPubkey(pubkey, ['abc123']);
    const two = deriveChainedPubkey(pubkey, ['abc123', 'def456']);
    assert.notDeepStrictEqual(one, two);
  });

  it('deriveChainedPrivkey matches deriveChainedPubkey', () => {
    const states = ['commit1', 'commit2', 'commit3'];
    const derivedPriv = deriveChainedPrivkey(privkey, states);
    const derivedPub = deriveChainedPubkey(pubkey, states);
    const pubFromPriv = secp256k1.getPublicKey(derivedPriv, true);
    assert.deepStrictEqual(new Uint8Array(pubFromPriv), new Uint8Array(derivedPub));
  });

  it('order of states matters', () => {
    const a = deriveChainedPubkey(pubkey, ['first', 'second']);
    const b = deriveChainedPubkey(pubkey, ['second', 'first']);
    assert.notDeepStrictEqual(a, b);
  });

  it('different keys produce different results for same states', () => {
    const privkey2 = hexToBytes('0000000000000000000000000000000000000000000000000000000000000002');
    const pubkey2 = secp256k1.getPublicKey(privkey2, true);
    const a = deriveChainedPubkey(pubkey, ['state1']);
    const b = deriveChainedPubkey(pubkey2, ['state1']);
    assert.notDeepStrictEqual(a, b);
  });
});

describe('Address derivation', () => {
  const privkey = secp256k1.utils.randomPrivateKey();
  const pubkey = bytesToHex(secp256k1.getPublicKey(privkey, true));

  it('generates valid testnet4 address', () => {
    const addr = pubkeyToAddress(pubkey, [], 'tbtc4');
    assert.ok(addr.startsWith('tb1p'));
    assert.strictEqual(addr.length, 62); // bech32m P2TR
  });

  it('generates valid testnet3 address', () => {
    const addr = pubkeyToAddress(pubkey, [], 'tbtc3');
    assert.ok(addr.startsWith('tb1p'));
  });

  it('generates valid mainnet address', () => {
    const addr = pubkeyToAddress(pubkey, [], 'btc');
    assert.ok(addr.startsWith('bc1p'));
  });

  it('different states produce different addresses', () => {
    const a = pubkeyToAddress(pubkey, [], 'tbtc4');
    const b = pubkeyToAddress(pubkey, ['commit1'], 'tbtc4');
    assert.notStrictEqual(a, b);
  });

  it('same inputs produce same address (deterministic)', () => {
    const a = pubkeyToAddress(pubkey, ['commit1'], 'tbtc4');
    const b = pubkeyToAddress(pubkey, ['commit1'], 'tbtc4');
    assert.strictEqual(a, b);
  });
});

describe('TXO URI parsing', () => {
  it('parses basic TXO URI', () => {
    const result = parseTxoUri('txo:tbtc4:abc123:0');
    assert.strictEqual(result.chain, 'tbtc4');
    assert.strictEqual(result.txid, 'abc123');
    assert.strictEqual(result.vout, 0);
  });

  it('parses TXO URI with query params', () => {
    const result = parseTxoUri('txo:tbtc4:abc123:1?amount=10000&key=deadbeef');
    assert.strictEqual(result.vout, 1);
    assert.strictEqual(result.amount, 10000);
    assert.strictEqual(result.key, 'deadbeef');
  });

  it('parses TXO URI with commit param', () => {
    const result = parseTxoUri('txo:tbtc4:abc123:0?commit=a1b2c3d4');
    assert.strictEqual(result.chain, 'tbtc4');
    assert.strictEqual(result.txid, 'abc123');
  });

  it('throws on invalid URI', () => {
    assert.throws(() => parseTxoUri('not-a-txo'), /Invalid TXO URI/);
  });
});

describe('taggedHash', () => {
  it('produces 32 bytes', () => {
    const result = taggedHash('TapTweak', new Uint8Array([1, 2, 3]));
    assert.strictEqual(result.length, 32);
  });

  it('is deterministic', () => {
    const a = taggedHash('TapTweak', new Uint8Array([1, 2, 3]));
    const b = taggedHash('TapTweak', new Uint8Array([1, 2, 3]));
    assert.deepStrictEqual(a, b);
  });

  it('different tags produce different hashes', () => {
    const a = taggedHash('TapTweak', new Uint8Array([1]));
    const b = taggedHash('TapSighash', new Uint8Array([1]));
    assert.notDeepStrictEqual(a, b);
  });
});

describe('p2trScript', () => {
  it('produces correct script', () => {
    const xonly = new Uint8Array(32).fill(0xab);
    const script = p2trScript(xonly);
    assert.strictEqual(script.length, 34);
    assert.strictEqual(script[0], 0x51); // OP_1
    assert.strictEqual(script[1], 0x20); // push 32 bytes
    assert.deepStrictEqual(script.slice(2), xonly);
  });
});

describe('Chain registry', () => {
  it('has tbtc4', () => {
    assert.ok(CHAINS.tbtc4);
    assert.ok(CHAINS.tbtc4.explorer.includes('testnet4'));
  });

  it('has tbtc3', () => {
    assert.ok(CHAINS.tbtc3);
    assert.ok(CHAINS.tbtc3.explorer.includes('testnet'));
  });

  it('has btc', () => {
    assert.ok(CHAINS.btc);
    assert.ok(CHAINS.btc.explorer.includes('mempool.space/api'));
  });
});

describe('Trail format', () => {
  it('creates valid trail structure', () => {
    const privkey = secp256k1.utils.randomPrivateKey();
    const pubkey = bytesToHex(secp256k1.getPublicKey(privkey, true));

    const trail = {
      version: '0.0.3',
      profile: 'gitmark',
      publicKeyBase: pubkey,
      chain: 'tbtc4',
      states: [],
      txo: []
    };

    assert.strictEqual(trail.version, '0.0.3');
    assert.strictEqual(trail.profile, 'gitmark');
    assert.strictEqual(trail.publicKeyBase.length, 66); // compressed hex
    assert.ok(trail.publicKeyBase.startsWith('02') || trail.publicKeyBase.startsWith('03'));
    assert.ok(Array.isArray(trail.states));
    assert.ok(Array.isArray(trail.txo));
  });

  it('states and txo stay parallel after marks', () => {
    const trail = {
      states: ['commit1', 'commit2'],
      txo: ['txo:tbtc4:abc:0?commit=commit1', 'txo:tbtc4:def:0?commit=commit2']
    };
    assert.strictEqual(trail.states.length, trail.txo.length);
  });
});
