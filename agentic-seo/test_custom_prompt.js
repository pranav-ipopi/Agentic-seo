const http = require('http');

const prompt = `i want you to create a bookmark on this backlinking site and register account if needed and solve captchas along the way
https://livebookmarking.com this is the site i want you to create backlink bookmark on this is the site i want you to add as link
https://evmvolkswagen.com/taigun-sport this is the keyword "Taigun price in kerala"`;

const postData = JSON.stringify({
  model: 'hermes-agent',
  messages: [{role: 'user', content: prompt}],
  stream: true
});

const options = {
  hostname: '13.140.131.128',
  port: 8642,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer Ipopi@123',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  res.on('end', () => {
    console.log('\nNo more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
