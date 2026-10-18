import { describe, it } from 'node:test';
import assert from 'node:assert';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

import {
  taggedHash, btScalar, deriveChainedPrivkey, deriveChainedPubkey,
  pubkeyToAddress, parseTxoUri, p2trScript, CHAINS, isDirty, loadFullTrail, loadTrailFromNotes,
  resolveVoucher, consumeVoucher, buildTransaction, findFunding, addressToScript,
  parseGithubRemote, explorerTxUrl, badgeMarkdown
} from '../bin/git-mark.js';
import { unifiedSighash, parseTransaction, SCRIPT_TYPE_TAPROOT } from '../lib/unified-sighash.js';
import { buildAnnouncement, publish, parseRelays, remoteUrls, allRemoteUrls, KIND_REPOSITORY } from '../lib/announce.js';
import { sha256 } from '@noble/hashes/sha256';
import { schnorr } from '@noble/curves/secp256k1';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import cp from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

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

  it('xbt uses mainnet addresses, the same as btc', () => {
    assert.strictEqual(pubkeyToAddress(pubkey, ['abc123'], 'xbt'), pubkeyToAddress(pubkey, ['abc123'], 'btc'));
  });

  it('txbt4 uses testnet addresses, the same as tbtc4', () => {
    assert.strictEqual(pubkeyToAddress(pubkey, ['abc123'], 'txbt4'), pubkeyToAddress(pubkey, ['abc123'], 'tbtc4'));
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

  it('has xbt, the BLAKE2b mainnet, signing with SIGHASH_UNIFIED', () => {
    assert.ok(CHAINS.xbt);
    assert.strictEqual(CHAINS.xbt.hrp, 'bc');
    assert.strictEqual(CHAINS.xbt.unified, true);
  });

  it('has txbt4, the BLAKE2b testnet4, signing with SIGHASH_UNIFIED', () => {
    assert.ok(CHAINS.txbt4);
    assert.ok(CHAINS.txbt4.explorer.includes('testnet4'));
    assert.strictEqual(CHAINS.txbt4.hrp, 'tb');
    assert.strictEqual(CHAINS.txbt4.unified, true);
  });

  it('SHA256d chains do not sign with SIGHASH_UNIFIED', () => {
    for (const c of ['tbtc3', 'tbtc4', 'btc', 'signet']) assert.ok(!CHAINS[c].unified, c);
  });
});

describe('Trail format', () => {
  it('creates valid trail structure', () => {
    const privkey = secp256k1.utils.randomPrivateKey();
    const pubkey = bytesToHex(secp256k1.getPublicKey(privkey, true));

    const trail = {
      version: '0.0.3',
      profile: 'gitmark',
      pubkeyBase: pubkey,
      chain: 'tbtc4',
      states: [],
      txo: []
    };

    assert.strictEqual(trail.version, '0.0.3');
    assert.strictEqual(trail.profile, 'gitmark');
    assert.strictEqual(trail.pubkeyBase.length, 66); // compressed hex
    assert.ok(trail.pubkeyBase.startsWith('02') || trail.pubkeyBase.startsWith('03'));
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

  it('@id is valid txo URI with amount and 64-char x-only pubkey', () => {
    const privkey = secp256k1.utils.randomPrivateKey();
    const pubkey = bytesToHex(secp256k1.getPublicKey(privkey, true));
    const xonly = pubkey.slice(2);
    const txid = 'a'.repeat(64);
    const id = `txo:tbtc4:${txid}:0?amount=14968&pubkey=${xonly}`;
    const parsed = parseTxoUri(id);
    assert.strictEqual(parsed.chain, 'tbtc4');
    assert.strictEqual(parsed.txid, txid);
    assert.strictEqual(parsed.amount, 14968);
    assert.strictEqual(xonly.length, 64);
  });

  it('txo URIs include amount and commit params', () => {
    const txoUri = 'txo:tbtc4:abc123:0?amount=9700&commit=deadbeef';
    const parsed = parseTxoUri(txoUri);
    assert.strictEqual(parsed.chain, 'tbtc4');
    assert.strictEqual(parsed.txid, 'abc123');
    assert.strictEqual(parsed.amount, 9700);
  });
});

describe('Dirty flag', () => {
  it('isDirty returns true by default (no config set)', () => {
    assert.strictEqual(isDirty(), true);
  });

  it('loadFullTrail returns null when no trail file exists', () => {
    const trail = loadFullTrail();
    assert.strictEqual(trail, null);
  });

  it('loadTrailFromNotes returns null when no trail file exists', () => {
    const trail = loadTrailFromNotes();
    assert.strictEqual(trail, null);
  });

  it('loadFullTrail uses loadTrail when dirty is true', () => {
    // Default is dirty=true, so loadFullTrail should behave like loadTrail
    const full = loadFullTrail();
    assert.strictEqual(full, null); // no blocktrails.json in test dir
  });
});

describe('TXO URI in git config format', () => {
  it('txo URI with amount and commit is parseable', () => {
    const uri = 'txo:tbtc4:abc123:0?amount=9700&commit=deadbeef';
    const parsed = parseTxoUri(uri);
    assert.strictEqual(parsed.txid, 'abc123');
    assert.strictEqual(parsed.vout, 0);
    assert.strictEqual(parsed.amount, 9700);
    assert.strictEqual(parsed.chain, 'tbtc4');
  });

  it('txo URI roundtrips through format used by savePrivateState', () => {
    const state = { txid: 'abcdef1234', vout: 0, amount: 14668 };
    const chain = 'tbtc4';
    const head = 'deadbeef';
    const uri = `txo:${chain}:${state.txid}:${state.vout}?amount=${state.amount}&commit=${head}`;
    const parsed = parseTxoUri(uri);
    assert.strictEqual(parsed.txid, state.txid);
    assert.strictEqual(parsed.vout, state.vout);
    assert.strictEqual(parsed.amount, state.amount);
  });
});

describe('Voucher resolution', () => {
  const uri1 = 'txo:tbtc4:aaa111:0?amount=15568&key=c9cb5a57062b61afc58e5e76d8e587117ba06d2c4e9891ee658896a828e758a6';
  const uri2 = 'txo:tbtc4:bbb222:1?amount=15568&key=c9cb5a57062b61afc58e5e76d8e587117ba06d2c4e9891ee658896a828e758a6';
  const uri3 = 'txo:tbtc4:ccc333:2?amount=15568&key=c9cb5a57062b61afc58e5e76d8e587117ba06d2c4e9891ee658896a828e758a6';

  it('returns URI as-is when not a file', () => {
    const r = resolveVoucher(uri1);
    assert.strictEqual(r.uri, uri1);
    assert.strictEqual(r.file, null);
  });

  it('reads last line from .txt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitmark-test-'));
    try {
      const path = join(dir, 'vouchers.txt');
      writeFileSync(path, `${uri1}\n${uri2}\n${uri3}\n`);
      const r = resolveVoucher(path);
      assert.strictEqual(r.uri, uri3);
      assert.strictEqual(r.file, path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads last line when using file: prefix', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitmark-test-'));
    try {
      const path = join(dir, 'vouchers'); // no .txt suffix
      writeFileSync(path, `${uri1}\n${uri2}\n`);
      const r = resolveVoucher(`file:${path}`);
      assert.strictEqual(r.uri, uri2);
      assert.strictEqual(r.file, path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('expands ~ to home directory', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'gitmark-home-'));
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const path = join(fakeHome, 'vouchers.txt');
      writeFileSync(path, `${uri1}\n`);
      const r = resolveVoucher('~/vouchers.txt');
      assert.strictEqual(r.uri, uri1);
      assert.strictEqual(r.file, path);
    } finally {
      process.env.HOME = originalHome;
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('exits with error on empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitmark-test-'));
    const originalExit = process.exit;
    const originalError = console.error;
    let exitCode = null;
    let errorMsg = null;
    process.exit = (code) => { exitCode = code; throw new Error('exit called'); };
    console.error = (msg) => { errorMsg = msg; };
    try {
      const path = join(dir, 'empty.txt');
      writeFileSync(path, '');
      assert.throws(() => resolveVoucher(path), /exit called/);
      assert.strictEqual(exitCode, 1);
      assert.match(errorMsg, /No vouchers/);
    } finally {
      process.exit = originalExit;
      console.error = originalError;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('consumeVoucher removes last line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitmark-test-'));
    try {
      const path = join(dir, 'vouchers.txt');
      writeFileSync(path, `${uri1}\n${uri2}\n${uri3}\n`);
      consumeVoucher(path);
      const remaining = readFileSync(path, 'utf8').trim().split('\n');
      assert.strictEqual(remaining.length, 2);
      assert.strictEqual(remaining[0], uri1);
      assert.strictEqual(remaining[1], uri2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('consumeVoucher handles last remaining line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitmark-test-'));
    try {
      const path = join(dir, 'vouchers.txt');
      writeFileSync(path, `${uri1}\n`);
      consumeVoucher(path);
      assert.strictEqual(readFileSync(path, 'utf8'), '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Unified sighash (Knots vectors)', () => {
  const [header, ...rows] = JSON.parse(readFileSync(new URL('./unified_sighash.json', import.meta.url), 'utf8'));

  it('has the expected vector layout', () => {
    assert.strictEqual(header.join(), 'scriptCode,rawTx,inIdx,hashType,scriptType,spentOutputs,sighash');
    assert.strictEqual(rows.length, 166);
  });

  it('matches every vector', () => {
    for (const [scriptCodeHex, rawTx, inIdx, hashType, scriptType, spent, expected] of rows) {
      const tx = parseTransaction(hexToBytes(rawTx));
      const spentOutputs = spent.map(([value, script]) => ({ value: BigInt(value), script: hexToBytes(script) }));
      const scriptCode = hexToBytes(scriptCodeHex);
      const opts = scriptType === 3 ? { leafScript: scriptCode } : { scriptCode };
      const got = bytesToHex(unifiedSighash(tx, inIdx, hashType, scriptType, spentOutputs, opts));
      assert.strictEqual(got, expected, `type=${scriptType} hashType=0x${hashType.toString(16)} in=${inIdx}`);
    }
  });
});

describe('Address to scriptPubKey', () => {
  it('decodes a taproot address back to the key it was made from', () => {
    const pub = bytesToHex(secp256k1.getPublicKey(hexToBytes('11'.repeat(32)), true));
    const addr = pubkeyToAddress(pub, ['abc123'], 'txbt4');
    const xonly = deriveChainedPubkey(hexToBytes(pub), ['abc123']).slice(1);
    assert.deepStrictEqual(addressToScript(addr, 'txbt4'), p2trScript(xonly));
  });

  it('decodes BIP173 v0 test vectors', () => {
    assert.strictEqual(bytesToHex(addressToScript('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', 'tbtc4')),
      '00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262');
    assert.strictEqual(bytesToHex(addressToScript('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4', 'btc')),
      '0014751e76e8199196d454941c45d1b3a323f1433bd6');
  });

  it('rejects another chain, a bad checksum and a v1 address with a bech32 checksum', () => {
    assert.throws(() => addressToScript('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', 'btc'), /not for btc/);
    assert.throws(() => addressToScript('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k8', 'tbtc4'), /checksum/);
    assert.throws(() => addressToScript('tb1pw508d6qejxtdg4y5r3zarqfsj6c3', 'tbtc4'), /checksum|Invalid/);
  });
});

describe('Signing', () => {
  const key = hexToBytes('11'.repeat(32));
  const xonly = secp256k1.getPublicKey(key, true).slice(1);
  // spend an untweaked output, as a trail step does, so the signing key is the key itself
  const input = { txid: 'ab'.repeat(32), vout: 1, amount: 10000, scriptPubKey: p2trScript(xonly) };
  const outputs = [{ amount: 9700, scriptPubKey: p2trScript(new Uint8Array(32).fill(7)) }];

  it('signs BIP341 by default: a 64-byte signature', () => {
    const tx = parseTransaction(hexToBytes(buildTransaction(input, outputs, key)));
    assert.strictEqual(tx.inputs[0].witness[0].length, 64);
  });

  it('signs SIGHASH_ALL|SIGHASH_UNIFIED when asked: 65 bytes ending 0x21, valid for the unified message', () => {
    const tx = parseTransaction(hexToBytes(buildTransaction(input, outputs, key, { unified: true })));
    const sig = tx.inputs[0].witness[0];
    assert.strictEqual(sig.length, 65);
    assert.strictEqual(sig[64], 0x21);
    const spent = [{ value: BigInt(input.amount), script: input.scriptPubKey }];
    const msg = unifiedSighash(tx, 0, 0x21, SCRIPT_TYPE_TAPROOT, spent);
    assert.ok(schnorr.verify(sig.slice(0, 64), msg, xonly));
  });

  it('the unified signature does not verify against the BIP341 message', () => {
    const plain = parseTransaction(hexToBytes(buildTransaction(input, outputs, key)));
    const unified = parseTransaction(hexToBytes(buildTransaction(input, outputs, key, { unified: true })));
    const bip341 = taggedHash('TapSighash', hexToBytes('0000'));   // any BIP341 message will do
    assert.ok(!schnorr.verify(unified.inputs[0].witness[0].slice(0, 64), bip341, xonly));
    assert.notDeepStrictEqual(plain.inputs[0].witness[0], unified.inputs[0].witness[0].slice(0, 64));
  });
});

describe('Badge', () => {
  it('reads owner and repo from GitHub remotes in every form', () => {
    for (const url of [
      'https://github.com/melvincarvalho/delivery-day.git',
      'https://github.com/melvincarvalho/delivery-day',
      'git@github.com:melvincarvalho/delivery-day.git',
      'ssh://git@github.com/melvincarvalho/delivery-day.git',
    ]) assert.deepStrictEqual(parseGithubRemote(url), { owner: 'melvincarvalho', repo: 'delivery-day' }, url);
  });

  it('returns null for remotes not on GitHub', () => {
    assert.strictEqual(parseGithubRemote('https://gitlab.com/a/b.git'), null);
    assert.strictEqual(parseGithubRemote(''), null);
  });

  it('links a transaction on the chain explorer', () => {
    assert.strictEqual(explorerTxUrl('txbt4', 'ab'), 'https://mempool.guide/testnet4/tx/ab');
    assert.strictEqual(explorerTxUrl('xbt', 'ab'), 'https://mempool.kilombino.com/tx/ab');
    assert.strictEqual(explorerTxUrl('btc', 'ab'), 'https://mempool.space/tx/ab');
    assert.strictEqual(explorerTxUrl('nope', 'ab'), null);
  });

  it('builds a shields.io dynamic JSON badge counting states', () => {
    const md = badgeMarkdown({
      trailUrl: 'https://raw.githubusercontent.com/melvincarvalho/delivery-day/gh-pages/blocktrails.json',
      chain: 'txbt4',
      link: 'https://mempool.guide/testnet4/tx/ab',
    });
    assert.strictEqual(md,
      '[![gitmarks](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmelvincarvalho%2Fdelivery-day%2Fgh-pages%2Fblocktrails.json' +
      '&query=%24.states.length&label=gitmarks&suffix=%20%C2%B7%20txbt4&color=f7931a)](https://mempool.guide/testnet4/tx/ab)');
  });
});

describe('Funding found at the base address', () => {
  const addr = 'tb1ptz5u4k877prwwsu2n5xw04vx0636ajm7a90vvka823934x56hlfsaqrat4';
  const rows = [
    { txid: 'aa'.repeat(32), vout: 0, value: 10000, status: { confirmed: false } },
    { txid: 'bb'.repeat(32), vout: 1, value: 4000, status: { confirmed: true } },
    { txid: 'cc'.repeat(32), vout: 0, value: 6000, status: { confirmed: true } },
  ];

  it('asks the explorer for the address and picks the largest confirmed coin', async () => {
    const seen = [];
    const fetch = async (url) => { seen.push(url); return { ok: true, json: async () => rows }; };
    const coin = await findFunding(addr, CHAINS.txbt4.explorer, { fetch });
    assert.strictEqual(seen[0], `${CHAINS.txbt4.explorer}/address/${addr}/utxo`);
    assert.deepStrictEqual(coin, { txid: 'cc'.repeat(32), vout: 0, amount: 6000, confirmed: true });
  });

  it('falls back to an unconfirmed coin, and to nothing', async () => {
    const only = async () => ({ ok: true, json: async () => [rows[0]] });
    assert.strictEqual((await findFunding(addr, CHAINS.txbt4.explorer, { fetch: only })).txid, 'aa'.repeat(32));
    const none = async () => ({ ok: true, json: async () => [] });
    assert.strictEqual(await findFunding(addr, CHAINS.txbt4.explorer, { fetch: none }), null);
    const bad = async () => ({ ok: false, status: 500 });
    await assert.rejects(findFunding(addr, CHAINS.txbt4.explorer, { fetch: bad }), /500/);
  });
});

describe('Announce (NIP-34 kind 30617)', () => {
  const privkey = '00'.repeat(31) + '01';
  const mark = { chain: 'txbt4', txo: 'txo:txbt4:' + 'ab'.repeat(32) + ':0', commit: 'de04775b6ade67b91caf15013ba73dad5f1b4b67' };

  it('parses relays from a comma or space separated config value, wss only', () => {
    assert.deepStrictEqual(parseRelays('wss://a.example, wss://b.example https://nope'), ['wss://a.example', 'wss://b.example']);
    assert.deepStrictEqual(parseRelays(null), []);
  });

  it('turns an ssh remote into https clone and web urls', () => {
    assert.deepStrictEqual(remoteUrls('git@github.com:blocktrails/fund-agent.git'),
      { clone: ['https://github.com/blocktrails/fund-agent.git', 'git@github.com:blocktrails/fund-agent.git'], web: 'https://github.com/blocktrails/fund-agent' });
    assert.deepStrictEqual(remoteUrls(null), { clone: [], web: null });
  });

  it('lists every remote as a clone tag, origin first, and all web pages in one web tag', () => {
    const remotes = ['git@github.com:o/demo.git', 'https://melvin.me/forge/' + 'ab'.repeat(32) + '/demo.git', 'https://github.com/o/demo.git'];
    assert.deepStrictEqual(allRemoteUrls(remotes), {
      clone: ['https://github.com/o/demo.git', 'git@github.com:o/demo.git', 'https://melvin.me/forge/' + 'ab'.repeat(32) + '/demo.git'],
      web: ['https://github.com/o/demo', 'https://melvin.me/forge/' + 'ab'.repeat(32) + '/demo'],
    });
    const ev = buildAnnouncement({ privkey, repoName: 'demo', remotes, createdAt: 1760000000 });
    assert.deepStrictEqual(ev.tags.filter((t) => t[0] === 'clone').map((t) => t[1]), allRemoteUrls(remotes).clone);
    assert.deepStrictEqual(ev.tags.find((t) => t[0] === 'web'), ['web', 'https://github.com/o/demo', 'https://melvin.me/forge/' + 'ab'.repeat(32) + '/demo']);
    assert.ok(schnorr.verify(ev.sig, ev.id, ev.pubkey));
    const none = buildAnnouncement({ privkey, repoName: 'demo', createdAt: 1760000000 });
    assert.ok(!none.tags.some((t) => t[0] === 'clone' || t[0] === 'web'), 'no remotes, no clone or web tags');
  });

  it('builds a signed event whose id and signature check out, with the mark in tags', () => {
    const ev = buildAnnouncement({ privkey, repoName: 'demo', remoteUrl: 'https://github.com/o/demo.git', branch: 'main', refs: [['refs/heads/main', 'ff'.repeat(20)]], mark, createdAt: 1760000000 });
    assert.strictEqual(ev.kind, KIND_REPOSITORY);
    assert.strictEqual(ev.pubkey, bytesToHex(schnorr.getPublicKey(hexToBytes(privkey))));
    const serialized = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
    assert.strictEqual(ev.id, bytesToHex(sha256(new TextEncoder().encode(serialized))));
    assert.ok(schnorr.verify(ev.sig, ev.id, ev.pubkey));
    const tag = (n) => ev.tags.find((t) => t[0] === n);
    assert.deepStrictEqual(tag('d'), ['d', 'demo']);
    assert.deepStrictEqual(tag('web'), ['web', 'https://github.com/o/demo']);
    assert.deepStrictEqual(tag('HEAD'), ['HEAD', 'ref: refs/heads/main']);
    assert.deepStrictEqual(tag('chain'), ['chain', 'txbt4']);
    assert.deepStrictEqual(tag('txo'), ['txo', mark.txo]);
    assert.deepStrictEqual(tag('commit'), ['commit', mark.commit]);
    assert.match(ev.content, /de04775b anchored on txbt4/);
  });

  it('publishes to each relay and reports its OK, timeout or refusal', async () => {
    const ev = buildAnnouncement({ privkey, repoName: 'demo', createdAt: 1760000000 });
    const sent = [];
    class FakeWS {
      constructor(url) { this.url = url; sent.push(url); setTimeout(() => this.onopen && this.onopen(), 0); }
      send(data) {
        const msg = JSON.parse(data); assert.strictEqual(msg[0], 'EVENT'); assert.strictEqual(msg[1].id, ev.id);
        if (this.url.includes('ok')) setTimeout(() => this.onmessage({ data: JSON.stringify(['OK', ev.id, true, '']) }), 0);
        else if (this.url.includes('no')) setTimeout(() => this.onmessage({ data: JSON.stringify(['OK', ev.id, false, 'blocked: no']) }), 0);
      }
      close() {}
    }
    const r = await publish(ev, ['wss://ok.example', 'wss://no.example', 'wss://silent.example'], { WebSocket: FakeWS, timeout: 50 });
    assert.deepStrictEqual(sent, ['wss://ok.example', 'wss://no.example', 'wss://silent.example']);
    assert.deepStrictEqual(r.map((x) => [x.ok, x.message]), [[true, ''], [false, 'blocked: no'], [false, 'timeout']]);
  });
});

describe('CLI guards', () => {
  const bin = new URL('../bin/git-mark.js', import.meta.url).pathname;
  const { spawnSync, execFileSync } = cp;

  function repo() {
    const dir = mkdtempSync(join(tmpdir(), 'gitmark-'));
    const env = { ...process.env, GIT_CONFIG_GLOBAL: join(dir, 'no-global'), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
    execFileSync('git', ['init', '-q'], { cwd: dir, env });
    writeFileSync(join(dir, 'a'), 'a');
    execFileSync('git', ['add', 'a'], { cwd: dir, env });
    execFileSync('git', ['commit', '-qm', 'first'], { cwd: dir, env });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, env, encoding: 'utf8' }).trim();
    return { dir, env, head, run: (...a) => spawnSync(process.execPath, [bin, ...a], { cwd: dir, env, encoding: 'utf8' }) };
  }

  it('an unknown word prints usage and exits 1 instead of marking', () => {
    const { dir, run } = repo();
    const r = run('anounce');
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /Unknown command: anounce/);
    assert.match(r.stderr, /git mark announce/);
    rmSync(dir, { recursive: true });
  });

  it('refuses to mark a commit that is already the last mark unless --force', () => {
    const { dir, env, head, run } = repo();
    execFileSync('git', ['config', '--local', 'nostr.privkey', '11'.repeat(32)], { cwd: dir, env });
    execFileSync('git', ['config', '--local', 'gitmark.txo', `txo:txbt4:${'ab'.repeat(32)}:0?amount=9700&commit=${head}`], { cwd: dir, env });
    const pub = bytesToHex(secp256k1.getPublicKey(hexToBytes('11'.repeat(32)), true));
    writeFileSync(join(dir, 'blocktrails.json'), JSON.stringify({ '@type': 'Blocktrail', version: '0.0.3', profile: 'gitmark', pubkeyBase: pub, chain: 'txbt4', states: [head], txo: [`txo:txbt4:${'ab'.repeat(32)}:0?amount=9700&commit=${head}`] }));
    const r = run();
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /already the last mark/);
    assert.match(r.stderr, /--force/);
    rmSync(dir, { recursive: true });
  });

  it('exodus needs an address', () => {
    const { dir, env, head, run } = repo();
    const pub = bytesToHex(secp256k1.getPublicKey(hexToBytes('11'.repeat(32)), true));
    writeFileSync(join(dir, 'blocktrails.json'), JSON.stringify({ '@type': 'Blocktrail', version: '0.0.3', profile: 'gitmark', pubkeyBase: pub, chain: 'txbt4', states: [head], txo: [] }));
    const r = run('exodus');
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /Usage: git mark exodus <address>/);
    rmSync(dir, { recursive: true });
  });

  it('a closed trail neither marks nor exoduses again', () => {
    const { dir, env, head, run } = repo();
    execFileSync('git', ['config', '--local', 'nostr.privkey', '11'.repeat(32)], { cwd: dir, env });
    execFileSync('git', ['config', '--local', 'gitmark.exodus', `txo:txbt4:${'cd'.repeat(32)}:0?amount=9400`], { cwd: dir, env });
    const pub = bytesToHex(secp256k1.getPublicKey(hexToBytes('11'.repeat(32)), true));
    writeFileSync(join(dir, 'blocktrails.json'), JSON.stringify({ '@type': 'Blocktrail', version: '0.0.3', profile: 'gitmark', pubkeyBase: pub, chain: 'txbt4', states: [], txo: [] }));
    const m = run();
    assert.strictEqual(m.status, 1);
    assert.match(m.stderr, /Trail is closed/);
    const e = run('exodus', pubkeyToAddress(pub, [], 'txbt4'));
    assert.strictEqual(e.status, 1);
    assert.match(e.stderr, /already closed/);
    rmSync(dir, { recursive: true });
  });
});
