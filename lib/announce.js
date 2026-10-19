// NIP-34 repository announcement (kind 30617) carrying the latest mark, and the
// repository state (kind 30618): where each branch is, the sync signal for mirrors.
// Same key as the trail (git config nostr.privkey), relays from git config nostr.relays,
// the convention git-nostr-hook set. No dependency beyond noble: the event is NIP-01
// serialised and schnorr-signed here, and sent over Node's own WebSocket.
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export const KIND_REPOSITORY = 30617;
export const KIND_STATE = 30618;
export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];

// Relay list from a config value: comma or whitespace separated, wss:// only
export function parseRelays(value) {
  return String(value || '').split(/[,\s]+/).map((r) => r.trim()).filter((r) => r.startsWith('wss://'));
}

// The clone URL as https, and the web page it implies
export function remoteUrls(remoteUrl) {
  if (!remoteUrl) return { clone: [], web: null };
  const https = remoteUrl.replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/').replace(/^git@([^:]+):/, 'https://$1/');
  const clone = https.startsWith('https://') ? [https, ...(remoteUrl !== https ? [remoteUrl] : [])] : [remoteUrl];
  const web = https.startsWith('https://') ? https.replace(/\.git$/, '') : null;
  return { clone, web };
}

// Every remote the repo has, in order, deduplicated: the mirrors the agent
// vouches for. NIP-34 allows several clone tags and a web tag with several URLs.
export function allRemoteUrls(remotes) {
  const clone = [];
  const web = [];
  for (const r of remotes || []) {
    const u = remoteUrls(r);
    for (const c of u.clone) if (!clone.includes(c)) clone.push(c);
    if (u.web && !web.includes(u.web)) web.push(u.web);
  }
  return { clone, web };
}

/**
 * Build and sign the announcement.
 * @param {object} o
 * @param {string} o.privkey - 64-char hex
 * @param {string} o.repoName - the d tag
 * @param {string} [o.remoteUrl] - one remote (kept for callers that have only origin)
 * @param {string[]} [o.remotes] - every remote URL, origin first; wins over remoteUrl
 * @param {string} [o.branch]
 * @param {[string, string][]} [o.refs] - [['refs/heads/main', sha], ...]
 * @param {{chain: string, txo: string, commit: string}} [o.mark] - the latest mark
 * @param {number} [o.createdAt]
 * @returns {object} signed NIP-01 event
 */
export function buildAnnouncement({ privkey, repoName, remoteUrl, remotes, branch, refs = [], mark, createdAt }) {
  const sk = hexToBytes(privkey);
  const pubkey = bytesToHex(schnorr.getPublicKey(sk));
  const { clone, web } = allRemoteUrls(remotes && remotes.length ? remotes : (remoteUrl ? [remoteUrl] : []));
  const tags = [['d', repoName], ['name', repoName]];
  if (branch) tags.push(['HEAD', `ref: refs/heads/${branch}`]);
  for (const c of clone) tags.push(['clone', c]);
  if (web.length) tags.push(['web', ...web]);
  for (const [ref, sha] of refs) tags.push([ref, sha]);
  if (mark) {
    tags.push(['chain', mark.chain]);
    tags.push(['txo', mark.txo]);
    tags.push(['commit', mark.commit]);
  }
  const content = mark ? `gitmark: ${mark.commit.slice(0, 8)} anchored on ${mark.chain}` : '';
  return signEvent(sk, KIND_REPOSITORY, tags, content, createdAt);
}

/**
 * Build and sign the repository state: one replaceable event per repo per key that says where
 * every branch is, as git ls-remote would. A new one from the trail key is the signal to pull,
 * and the mark tags let a reader check the named commit against the chain before trusting it.
 * @param {object} o
 * @param {string} o.privkey - 64-char hex
 * @param {string} o.repoName - the d tag, the same as the announcement's
 * @param {string} [o.branch] - the current branch, as HEAD
 * @param {[string, string][]} [o.refs] - [['refs/heads/main', sha], ...]
 * @param {{chain: string, txo: string, commit: string}} [o.mark] - the latest mark
 * @param {number} [o.createdAt]
 * @returns {object} signed NIP-01 event
 */
export function buildState({ privkey, repoName, branch, refs = [], mark, createdAt }) {
  const sk = hexToBytes(privkey);
  const tags = [['d', repoName]];
  if (branch) tags.push(['HEAD', `ref: refs/heads/${branch}`]);
  for (const [ref, sha] of refs) tags.push([ref, sha]);
  if (mark) {
    tags.push(['chain', mark.chain]);
    tags.push(['txo', mark.txo]);
    tags.push(['commit', mark.commit]);
  }
  return signEvent(sk, KIND_STATE, tags, '', createdAt);
}

// NIP-01: serialise, hash, schnorr-sign
function signEvent(sk, kind, tags, content, createdAt) {
  const pubkey = bytesToHex(schnorr.getPublicKey(sk));
  const created_at = createdAt ?? Math.floor(Date.now() / 1000);
  const serialized = JSON.stringify([0, pubkey, created_at, kind, tags, content]);
  const id = bytesToHex(sha256(new TextEncoder().encode(serialized)));
  const sig = bytesToHex(schnorr.sign(id, sk));
  return { id, pubkey, created_at, kind, tags, content, sig };
}

/**
 * Send one event to each relay and wait for its OK. Never throws: one result per relay.
 * @param {object} event
 * @param {string[]} relays
 * @param {{WebSocket?: typeof WebSocket, timeout?: number}} [options]
 * @returns {Promise<{relay: string, ok: boolean, message: string}[]>}
 */
export function publish(event, relays, { WebSocket: WS = globalThis.WebSocket, timeout = 8000 } = {}) {
  return Promise.all(relays.map((relay) => new Promise((resolve) => {
    let done = false;
    const finish = (ok, message) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch {} resolve({ relay, ok, message }); };
    const timer = setTimeout(() => finish(false, 'timeout'), timeout);
    let ws;
    try { ws = new WS(relay); } catch (e) { return finish(false, e.message); }
    ws.onopen = () => ws.send(JSON.stringify(['EVENT', event]));
    ws.onmessage = (m) => {
      let msg; try { msg = JSON.parse(typeof m.data === 'string' ? m.data : String(m.data)); } catch { return; }
      if (msg[0] === 'OK' && msg[1] === event.id) finish(!!msg[2], msg[3] || '');
      else if (msg[0] === 'NOTICE') finish(false, String(msg[1] || 'notice'));
    };
    ws.onerror = (e) => finish(false, (e && e.message) || 'connection failed');
    ws.onclose = () => finish(false, 'closed');
  })));
}
