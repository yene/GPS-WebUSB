
var queryUpdateRate = '$PMTK400*36\r\n\0';
var expectedResult = '24504d544b3430302a33360d0a00';

// Using the node built in Buffer
var buf = Buffer.from(queryUpdateRate, 'ascii');
console.log(buf);
console.log(buf.toString('hex') == expectedResult);

// Using the chrome built in TextEncoder (which is also inside nodes util)
var TextEncoder = require('util').TextEncoder;
var enc = new TextEncoder()
var buf2 = enc.encode(queryUpdateRate);
console.log(buf2hex(buf2));
console.log(buf2hex(buf2) == expectedResult);


// buf2hex converts an ArrayBuffer to a hex string
function buf2hex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}
