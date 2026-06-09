const http = require('http');

const req = http.request('http://13.140.131.128:8642/v1/skills', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer Ipopi@123'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk.toString();
  });
  res.on('end', () => {
    console.log(data);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
