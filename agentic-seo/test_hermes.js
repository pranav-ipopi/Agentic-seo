const http = require('http');

const req = http.request('http://localhost:8642/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  res.on('data', (chunk) => {
    console.log(chunk.toString());
  });
});

req.write(JSON.stringify({
  model: 'hermes-agent',
  messages: [{role: 'user', content: 'research laxmitata.co.in'}],
  stream: true
}));

req.end();
