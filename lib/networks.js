// network
const BITMARK = {
  messagePrefix: '\x19BITMARK Signed Message:\n',
  bech32: 'btm',
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe
  },
  pubKeyHash: 85,
  scriptHash: 0x32,
  wif: 213
}

exports.BITMARK = BITMARK

exports.LIQUID = {
  messagePrefix: '\x18Liquid Signed Message:\n',
  bech32: 'ex',
  blech32: 'lq',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4
  },
  pubKeyHash: 57,
  scriptHash: 39,
  wif: 0x80,
  confidentialPrefix: 12,
  assetHash: '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d'
}