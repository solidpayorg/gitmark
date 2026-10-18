// NIP-34 repository announcement (kind 30617) carrying the latest mark.
// Same key as the trail (git config nostr.privkey), relays from git config nostr.relays,
// the convention git-nostr-hook set. No dependency beyond noble: the event is NIP-01
// serialised and schnorr-signed here, and sent over Node's own WebSocket.
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export const KIND_REPOSITORY = 30617;
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

/**
 * Build and sign the announcement.
 * @param {object} o
 * @param {string} o.privkey - 64-char hex
 * @param {string} o.repoName - the d tag
 * @param {string} [o.remoteUrl]
 * @param {string} [o.branch]
 * @param {[string, string][]} [o.refs] - [['refs/heads/main', sha], ...]
 * @param {{chain: string, txo: string, commit: string}} [o.mark] - the latest mark
 * @param {number} [o.createdAt]
 * @returns {object} signed NIP-01 event
 */
export function buildAnnouncement({ privkey, repoName, remoteUrl, branch, refs = [], mark, createdAt }) {
  const sk = hexToBytes(privkey);
  const pubkey = bytesToHex(schnorr.getPublicKey(sk));
  const { clone, web } = remoteUrls(remoteUrl);
  const tags = [['d', repoName], ['name', repoName]];
  if (branch) tags.push(['HEAD', `ref: refs/heads/${branch}`]);
  for (const c of clone) tags.push(['clone', c]);
  if (web) tags.push(['web', web]);
  for (const [ref, sha] of refs) tags.push([ref, sha]);
  if (mark) {
    tags.push(['chain', mark.chain]);
    tags.push(['txo', mark.txo]);
    tags.push(['commit', mark.commit]);
  }
  const created_at = createdAt ?? Math.floor(Date.now() / 1000);
  const content = mark ? `gitmark: ${mark.commit.slice(0, 8)} anchored on ${mark.chain}` : '';
  const serialized = JSON.stringify([0, pubkey, created_at, KIND_REPOSITORY, tags, content]);
  const id = bytesToHex(sha256(new TextEncoder().encode(serialized)));
  const sig = bytesToHex(schnorr.sign(id, sk));
  return { id, pubkey, created_at, kind: KIND_REPOSITORY, tags, content, sig };
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
