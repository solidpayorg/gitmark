#!/usr/bin/env node

/**
 * git-mark — Anchor git commits to Bitcoin via blocktrails
 *
 * Usage:
 *   git mark init [--chain tbtc4] [--voucher txo:...]
 *   git mark [--chain tbtc4]
 *   git mark info
 *   git mark verify
 */

import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// --- Constants ---
const SECP_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const TRAIL_FILE = 'blocktrails.json';
const PRIVATE_FILE = '.git/blocktrails.json';
const DEFAULT_CHAIN = 'tbtc4';

const CHAINS = {
  tbtc3:  { explorer: 'https://mempool.space/testnet/api', name: 'Bitcoin Testnet3' },
  tbtc4:  { explorer: 'https://mempool.space/testnet4/api', name: 'Bitcoin Testnet4' },
  btc:    { explorer: 'https://mempool.space/api', name: 'Bitcoin' },
  signet: { explorer: 'https://mempool.space/signet/api', name: 'Bitcoin Signet' },
};

// --- Blocktrails key chaining (BIP-341) ---
function taggedHash(tag, ...msgs) {
  const tagHash = sha256(new TextEncoder().encode(tag));
  return sha256(concatBytes(tagHash, tagHash, ...msgs));
}

function btScalar(pubkeyCompressed, state) {
  const xOnly = pubkeyCompressed.slice(1);
  const stateBytes = typeof state === 'string' ? new TextEncoder().encode(state) : state;
  const sh = sha256(stateBytes);
  return bytesToBigInt(taggedHash('TapTweak', xOnly, sh)) % SECP_N;
}

function bytesToBigInt(bytes) {
  return BigInt('0x' + bytesToHex(bytes));
}

function bigIntToBytes(n) {
  const hex = n.toString(16).padStart(64, '0');
  return hexToBytes(hex);
}

function deriveChainedPrivkey(privkeyBytes, states) {
  let d = bytesToBigInt(privkeyBytes);
  let cur = new Uint8Array(secp256k1.getPublicKey(privkeyBytes, true));
  for (const s of states) {
    const t = btScalar(cur, s);
    d = (d + t) % SECP_N;
    cur = new Uint8Array(secp256k1.ProjectivePoint.BASE.multiply(d).toRawBytes(true));
  }
  return bigIntToBytes(d);
}

function deriveChainedPubkey(pubkeyBase, states) {
  let P = secp256k1.ProjectivePoint.fromHex(bytesToHex(pubkeyBase));
  let cur = pubkeyBase;
  for (const s of states) {
    const t = btScalar(cur, s);
    P = P.add(secp256k1.ProjectivePoint.BASE.multiply(t));
    cur = new Uint8Array(P.toRawBytes(true));
  }
  return cur;
}

// --- Bech32m encoding ---
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) { const b = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ v; for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i]; }
  return chk;
}
function hrpExpand(hrp) { const r = []; for (const c of hrp) r.push(c.charCodeAt(0) >> 5); r.push(0); for (const c of hrp) r.push(c.charCodeAt(0) & 31); return r; }
function convertBits(data, from, to) { let acc = 0, bits = 0; const r = []; const max = (1 << to) - 1; for (const v of data) { acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; r.push((acc >> bits) & max); } } if (bits > 0) r.push((acc << (to - bits)) & max); return r; }

function bech32mEncode(hrp, version, program) {
  const values = [version, ...convertBits(program, 8, 5)];
  const enc = [...hrpExpand(hrp), ...values, 0, 0, 0, 0, 0, 0];
  const mod = polymod(enc) ^ 0x2bc830a3;
  const checksum = [0, 1, 2, 3, 4, 5].map(i => (mod >> (5 * (5 - i))) & 31);
  let result = hrp + '1';
  for (const v of [...values, ...checksum]) result += BECH32_CHARSET[v];
  return result;
}

function pubkeyToAddress(pubkeyHex, states, chain) {
  const pubBytes = hexToBytes(pubkeyHex);
  const derived = states.length > 0 ? deriveChainedPubkey(pubBytes, states) : pubBytes;
  const xOnly = derived.slice(1);
  const hrp = chain === 'btc' ? 'bc' : 'tb';
  return bech32mEncode(hrp, 1, xOnly);
}

// --- P2TR script ---
function p2trScript(xonly) {
  return new Uint8Array([0x51, 0x20, ...xonly]);
}

// --- Transaction building helpers ---
function writeVarInt(n) {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) { const b = new Uint8Array(3); b[0] = 0xfd; b[1] = n & 0xff; b[2] = (n >> 8) & 0xff; return b; }
  return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}
function writeU32LE(n) { const b = new Uint8Array(4); b[0] = n & 0xff; b[1] = (n >> 8) & 0xff; b[2] = (n >> 16) & 0xff; b[3] = (n >> 24) & 0xff; return b; }
function writeU64LE(n) { const b = new Uint8Array(8); let v = BigInt(n); for (let i = 0; i < 8; i++) { b[i] = Number(v & 0xffn); v >>= 8n; } return b; }
function concatBytes(...arrays) { const r = new Uint8Array(arrays.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of arrays) { r.set(a, o); o += a.length; } return r; }
function reverseTxid(txid) { return hexToBytes(txid).reverse(); }

function buildTransaction(input, outputs, privkeyBytes) {
  const inputs = [input];
  const internalXOnly = new Uint8Array(secp256k1.getPublicKey(privkeyBytes, true)).slice(1);
  const untweakedHex = '5120' + bytesToHex(internalXOnly);
  const needsTweak = bytesToHex(inputs[0].scriptPubKey) !== untweakedHex;
  let signingKey = privkeyBytes;
  if (needsTweak) {
    const tweak = taggedHash('TapTweak', internalXOnly);
    const t = bytesToBigInt(tweak);
    let d = bytesToBigInt(privkeyBytes);
    const fullPub = secp256k1.getPublicKey(privkeyBytes, false);
    if (fullPub[64] & 1) d = SECP_N - d;
    signingKey = bigIntToBytes((d + t) % SECP_N);
  }

  const version = 2, locktime = 0, sequence = 0xfffffffd;
  const serOutputs = outputs.map(o =>
    concatBytes(writeU64LE(o.amount), writeVarInt(o.scriptPubKey.length), o.scriptPubKey)
  );

  const shaPrevouts = sha256(concatBytes(...inputs.map(i => concatBytes(reverseTxid(i.txid), writeU32LE(i.vout)))));
  const shaAmounts = sha256(concatBytes(...inputs.map(i => writeU64LE(i.amount))));
  const shaScriptPubKeys = sha256(concatBytes(...inputs.map(i => concatBytes(writeVarInt(i.scriptPubKey.length), i.scriptPubKey))));
  const shaSequences = sha256(concatBytes(...inputs.map(() => writeU32LE(sequence))));
  const shaOutputs = sha256(concatBytes(...serOutputs));

  const sigs = [];
  for (let i = 0; i < inputs.length; i++) {
    const sigMsg = concatBytes(
      new Uint8Array([0x00, 0x00]),
      writeU32LE(version), writeU32LE(locktime),
      shaPrevouts, shaAmounts, shaScriptPubKeys, shaSequences, shaOutputs,
      new Uint8Array([0x00]),
      writeU32LE(i)
    );
    const sighash = taggedHash('TapSighash', sigMsg);
    sigs.push(schnorr.sign(sighash, signingKey));
  }

  const parts = [
    writeU32LE(version),
    new Uint8Array([0x00, 0x01]),
    writeVarInt(inputs.length)
  ];
  for (const inp of inputs) {
    parts.push(reverseTxid(inp.txid), writeU32LE(inp.vout), new Uint8Array([0x00]), writeU32LE(sequence));
  }
  parts.push(writeVarInt(outputs.length));
  for (const so of serOutputs) parts.push(so);
  for (const sig of sigs) {
    parts.push(new Uint8Array([0x01]), writeVarInt(sig.length), sig);
  }
  parts.push(writeU32LE(locktime));
  return bytesToHex(concatBytes(...parts));
}

async function broadcastTx(rawHex, explorer) {
  const resp = await fetch(`${explorer}/tx`, { method: 'POST', body: rawHex, headers: { 'Content-Type': 'text/plain' } });
  if (!resp.ok) throw new Error(`Broadcast failed: ${await resp.text()}`);
  return (await resp.text()).trim();
}

// --- Git helpers ---
function gitExec(cmd) { return execSync(cmd, { encoding: 'utf8' }).trim(); }
function getHead() { return gitExec('git rev-parse HEAD'); }
function getPrivkey() {
  try { return gitExec('git config --local nostr.privkey'); } catch { return null; }
}
function setPrivkey(key) { gitExec(`git config --local nostr.privkey ${key}`); }
function isGitRoot() { return existsSync('.git'); }

// --- Trail file helpers ---
function loadTrail() {
  if (!existsSync(TRAIL_FILE)) return null;
  return JSON.parse(readFileSync(TRAIL_FILE, 'utf8'));
}
function saveTrail(trail) {
  writeFileSync(TRAIL_FILE, JSON.stringify(trail, null, 2) + '\n');
}
function loadPrivateState() {
  if (!existsSync(PRIVATE_FILE)) return null;
  return JSON.parse(readFileSync(PRIVATE_FILE, 'utf8'));
}
function savePrivateState(state) {
  writeFileSync(PRIVATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// --- Parse TXO URI ---
function parseTxoUri(uri) {
  const match = uri.match(/^txo:([^:]+):([a-f0-9]+):(\d+)/);
  if (!match) throw new Error('Invalid TXO URI');
  const params = new URLSearchParams(uri.split('?')[1] || '');
  return { chain: match[1], txid: match[2], vout: parseInt(match[3]), amount: parseInt(params.get('amount')), key: params.get('key') };
}

// --- Commands ---
async function cmdInit(args) {
  if (!isGitRoot()) {
    console.error('Error: .git/ not found in current directory. Run from a git repo root.');
    process.exit(1);
  }
  if (existsSync(TRAIL_FILE) && !args.includes('--force')) {
    console.error(`Error: ${TRAIL_FILE} already exists. Use --force to reinitialize.`);
    process.exit(1);
  }

  // Chain
  const chainIdx = args.indexOf('--chain');
  const chain = chainIdx !== -1 ? args[chainIdx + 1] : DEFAULT_CHAIN;
  if (!CHAINS[chain]) { console.error(`Unknown chain: ${chain}`); process.exit(1); }

  // Key
  let privkey = getPrivkey();
  let keySource = 'git config';
  if (!privkey) {
    const sk = secp256k1.utils.randomPrivateKey();
    privkey = bytesToHex(sk);
    setPrivkey(privkey);
    keySource = 'generated';
  }
  const pubkey = bytesToHex(secp256k1.getPublicKey(hexToBytes(privkey), true));

  // Create trail
  const trail = {
    version: '0.0.3',
    profile: 'gitmark',
    publicKeyBase: pubkey,
    chain,
    states: [],
    txo: []
  };

  // Voucher funding
  const voucherIdx = args.indexOf('--voucher');
  if (voucherIdx !== -1) {
    const voucherUri = args[voucherIdx + 1];
    const txo = parseTxoUri(voucherUri);
    if (!txo.key) { console.error('Voucher must include &key= parameter'); process.exit(1); }
    if (!txo.amount) { console.error('Voucher must include &amount= parameter'); process.exit(1); }

    const voucherKey = hexToBytes(txo.key);
    const baseXonly = hexToBytes(pubkey).slice(1);
    const baseScript = p2trScript(baseXonly);

    // Fetch voucher scriptPubKey
    const explorer = CHAINS[chain].explorer;
    const txResp = await fetch(`${explorer}/tx/${txo.txid}`);
    if (!txResp.ok) { console.error('Could not fetch voucher transaction'); process.exit(1); }
    const txData = await txResp.json();
    const prevOut = txData.vout?.[txo.vout];
    if (!prevOut) { console.error(`Voucher output ${txo.vout} not found`); process.exit(1); }

    const fee = 300;
    const outputAmount = txo.amount - fee;
    if (outputAmount <= 546) { console.error('Voucher too small'); process.exit(1); }

    const rawTx = buildTransaction(
      { txid: txo.txid, vout: txo.vout, amount: txo.amount, scriptPubKey: hexToBytes(prevOut.scriptpubkey) },
      [{ amount: outputAmount, scriptPubKey: baseScript }],
      voucherKey
    );
    const newTxid = await broadcastTx(rawTx, explorer);

    savePrivateState({ txid: newTxid, vout: 0, amount: outputAmount });
    console.log(`Funded: ${outputAmount} sats (txid: ${newTxid})`);
  }

  saveTrail(trail);

  console.log(`Initialized gitmark trail: ${TRAIL_FILE}`);
  console.log(`Key source: ${keySource}`);
  console.log(`Base public key: ${pubkey}`);
  console.log(`Chain: ${chain}`);
  console.log(`Address: ${pubkeyToAddress(pubkey, [], chain)}`);
  if (!existsSync(PRIVATE_FILE) && voucherIdx === -1) {
    console.log(`\nUnfunded. Use: git mark init --voucher txo:${chain}:txid:vout?amount=X&key=Y`);
    console.log(`Or send sats to: ${pubkeyToAddress(pubkey, [], chain)}`);
  }
}

async function cmdMark(args) {
  const trail = loadTrail();
  if (!trail) { console.error(`No ${TRAIL_FILE} found. Run: git mark init`); process.exit(1); }
  const priv = loadPrivateState();
  if (!priv) { console.error('No funding. Run: git mark init --voucher txo:...'); process.exit(1); }

  const privkey = getPrivkey();
  if (!privkey) { console.error('No private key. Set: git config nostr.privkey <hex>'); process.exit(1); }

  const head = getHead();
  const chain = trail.chain;
  const explorer = CHAINS[chain]?.explorer;
  if (!explorer) { console.error(`Unknown chain: ${chain}`); process.exit(1); }

  // All previous states + current commit
  const prevStates = [...trail.states];
  const allStates = [...prevStates, head];

  // Derive signing key (chained through previous states)
  const signingKey = prevStates.length > 0
    ? deriveChainedPrivkey(hexToBytes(privkey), prevStates)
    : hexToBytes(privkey);

  // Derive next address (chained through all states including current)
  const nextPub = deriveChainedPubkey(hexToBytes(trail.publicKeyBase), allStates);
  const nextXonly = nextPub.slice(1);
  const nextScript = p2trScript(nextXonly);

  // Fetch current UTXO scriptPubKey
  const txResp = await fetch(`${explorer}/tx/${priv.txid}`);
  if (!txResp.ok) { console.error('Could not fetch current UTXO'); process.exit(1); }
  const txData = await txResp.json();
  const prevOut = txData.vout?.[priv.vout];
  if (!prevOut) { console.error('Current UTXO not found'); process.exit(1); }

  const fee = 300;
  const outputAmount = priv.amount - fee;
  if (outputAmount <= 546) { console.error('Trail UTXO too small. Fund with: git mark init --voucher ...'); process.exit(1); }

  const rawTx = buildTransaction(
    { txid: priv.txid, vout: priv.vout, amount: priv.amount, scriptPubKey: hexToBytes(prevOut.scriptpubkey) },
    [{ amount: outputAmount, scriptPubKey: nextScript }],
    signingKey
  );
  const newTxid = await broadcastTx(rawTx, explorer);

  // Update trail
  trail.states.push(head);
  trail.txo.push(`txo:${chain}:${newTxid}:0?commit=${head}`);
  saveTrail(trail);

  // Update private state
  savePrivateState({ txid: newTxid, vout: 0, amount: outputAmount });

  const address = pubkeyToAddress(trail.publicKeyBase, allStates, chain);
  console.log(`Marked: ${head.slice(0, 8)} → ${newTxid.slice(0, 16)}...`);
  console.log(`Address: ${address}`);
  console.log(`Balance: ${outputAmount} sats`);
  console.log(`TXO: txo:${chain}:${newTxid}:0?commit=${head}`);
}

async function cmdInfo() {
  const trail = loadTrail();
  if (!trail) { console.error(`No ${TRAIL_FILE} found.`); process.exit(1); }
  const priv = loadPrivateState();

  console.log(`Profile: ${trail.profile}`);
  console.log(`Version: ${trail.version}`);
  console.log(`Chain: ${trail.chain}`);
  console.log(`Base public key: ${trail.publicKeyBase}`);
  console.log(`Base address: ${pubkeyToAddress(trail.publicKeyBase, [], trail.chain)}`);
  console.log(`Marks: ${trail.states.length}`);
  if (trail.states.length > 0) {
    const currentAddr = pubkeyToAddress(trail.publicKeyBase, trail.states, trail.chain);
    console.log(`Current address: ${currentAddr}`);
    console.log(`Last commit: ${trail.states[trail.states.length - 1]}`);
    console.log(`Last TXO: ${trail.txo[trail.txo.length - 1]}`);
  }
  if (priv) {
    console.log(`Balance: ${priv.amount} sats`);
  } else {
    console.log('Balance: unfunded');
  }
}

async function cmdVerify() {
  const trail = loadTrail();
  if (!trail) { console.error(`No ${TRAIL_FILE} found.`); process.exit(1); }
  if (trail.states.length === 0) { console.log('No marks to verify.'); return; }

  const chain = CHAINS[trail.chain];
  if (!chain) { console.error(`Unknown chain: ${trail.chain}`); process.exit(1); }

  console.log(`Verifying ${trail.states.length} mark(s)...`);
  let ok = true;

  for (let i = 0; i < trail.states.length; i++) {
    const statesUpTo = trail.states.slice(0, i + 1);
    const expectedAddr = pubkeyToAddress(trail.publicKeyBase, statesUpTo, trail.chain);
    const txoUri = trail.txo[i];
    const parsed = parseTxoUri(txoUri);

    try {
      const resp = await fetch(`${chain.explorer}/tx/${parsed.txid}`);
      if (!resp.ok) { console.log(`  [${i}] FAIL — tx not found: ${parsed.txid.slice(0, 16)}...`); ok = false; continue; }
      const txData = await resp.json();
      const out = txData.vout?.[parsed.vout];
      if (!out) { console.log(`  [${i}] FAIL — output ${parsed.vout} not found`); ok = false; continue; }
      if (out.scriptpubkey_address === expectedAddr) {
        console.log(`  [${i}] OK — ${trail.states[i].slice(0, 8)} → ${expectedAddr.slice(0, 20)}...`);
      } else {
        console.log(`  [${i}] FAIL — address mismatch`);
        console.log(`    expected: ${expectedAddr}`);
        console.log(`    got:      ${out.scriptpubkey_address}`);
        ok = false;
      }
    } catch (e) {
      console.log(`  [${i}] ERROR — ${e.message}`);
      ok = false;
    }
  }

  console.log(ok ? '\nAll marks verified.' : '\nVerification failed.');
  process.exit(ok ? 0 : 1);
}

// --- Exports for testing ---
export {
  taggedHash, btScalar, deriveChainedPrivkey, deriveChainedPubkey,
  pubkeyToAddress, parseTxoUri, p2trScript, buildTransaction,
  TRAIL_FILE, PRIVATE_FILE, CHAINS
};

// --- CLI ---
const isMain = process.argv[1]?.endsWith('git-mark.js') || process.argv[1]?.endsWith('git-mark');
if (isMain) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'init') {
    cmdInit(args.slice(1));
  } else if (cmd === 'info') {
    cmdInfo();
  } else if (cmd === 'verify') {
    cmdVerify();
  } else if (cmd === 'mark' || !cmd || (cmd && !cmd.startsWith('-'))) {
    if (!existsSync(TRAIL_FILE) && cmd !== 'mark') {
      console.log('Usage:');
      console.log('  git mark init [--chain tbtc4] [--voucher txo:...]');
      console.log('  git mark                  # anchor HEAD to Bitcoin');
      console.log('  git mark info             # show trail state');
      console.log('  git mark verify           # verify trail against Bitcoin');
    } else {
      cmdMark(args.slice(cmd === 'mark' ? 1 : 0));
    }
  } else {
    console.log('Usage:');
    console.log('  git mark init [--chain tbtc4] [--voucher txo:...]');
    console.log('  git mark                  # anchor HEAD to Bitcoin');
    console.log('  git mark info             # show trail state');
    console.log('  git mark verify           # verify trail against Bitcoin');
  }
}
