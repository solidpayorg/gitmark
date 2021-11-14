#!/usr/bin/env node

var WebSocket = require('ws');

var secret = process.env['SECRET'] || 's'

var uri = process.argv[2] || 'ws://localhost:4444'

const ws = new WebSocket(uri)

ws.on('open', function open() {
  ws.send(`update ${process.argv[2] || 'a'} ${secret}`)
  ws.close()
})

ws.on('message', function incoming(message) {
  console.log('received: %s', message);
});


