// AddNMEAChecksum taken from http://www.hhhh.org/wiml/proj/nmeaxor.html
export function addNMEAChecksum(cmd) {
  if (cmd.charAt(0) === '$') {
    cmd = cmd.slice(1);
  }

  // Compute the checksum by XORing all the character values in the string.
  var checksum = 0;
  for (var i = 0; i < cmd.length; i++) {
    checksum = checksum ^ cmd.charCodeAt(i);
  }

  // Convert it to hexadecimal (base-16, upper case, most significant nybble first).
  var hexsum = Number(checksum).toString(16).toUpperCase();
  if (hexsum.length < 2) {
    hexsum = ('00' + hexsum).slice(-2);
  }
  return '$' + cmd + '*' + hexsum;
}

export function downloadData(data, filename, type) {
  var a = document.createElement('a');
  var body = document.getElementById('app');
  body.appendChild(a);
  var file = new Blob([data], { type: type });
  var url = URL.createObjectURL(file);
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(function() {
    body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 0);
}

export function fixPMTKMacAddress(mac) {
  return mac.match(/.{1,2}/g).reverse().join(':');
}

export function number2hex(number) {
  var hex = number.toString(16);
  return ("00000000" + hex).slice(-8);
}
