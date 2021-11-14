#!/bin/bash

RAWTX=$(/home/ubuntu/bitmark/src/bitmark-cli createrawtransaction '[{"txid": "'$1'", "vout": '$2'}]' '{"'$3'": '$4', "'$6'": '$7'}')

SENDTX=$(/home/ubuntu/bitmark/src/bitmark-cli signrawtransaction $RAWTX null '["'$5'"]' | grep ffff | sed 's/.*: "\(.*\)".*/\1/')

NEWTX=$(/home/ubuntu/bitmark/src/bitmark-cli sendrawtransaction $SENDTX)

echo $NEWTX
