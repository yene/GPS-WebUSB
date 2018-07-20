var USB = require('webusb').USB;
var usb = new USB(
  {devicesFound: deviceFound}

);
const vendorId = 0x0e8d;

function deviceFound(device) {
  console.log(`Device '${device.productName || device.serialNumber}' connected`);
}

usb.requestDevice({
  filters: [{vendorId: vendorId}]
})
.then(device => deviceFound(device))
.catch(error => {
  console.log(error.message);
  process.exit();
});

usb.addEventListener("connect", deviceFound);

usb.addEventListener("disconnect", device => {
    console.log(`Device '${device.productName || device.serialNumber}' disconnected`);
});
