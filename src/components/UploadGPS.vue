<template>
  <div class="gps">
    <template v-if="wrongBrowser">
      <h3>Please use the latest version of Google Chrome</h3>
      <p>
        <a href="https://www.google.com/chrome/"><img src="/img/chrome-logo.svg" alt="Chrome is a fast, secure, free web browser." ></a>
      </p>
    </template>
    <template v-else-if="device !== null">
      <p>Connected with GPS Tracker</p>
      <br>
      <button class="button is-link is-outlined" v-on:click="startListening">Start Listening</button>
      <br><br>
      <div class="control">
        <input class="input" v-model="name" type="text" placeholder="Device Name">
      </div>
      <button v-if="downloadProgress === 0" class="button is-link is-outlined" v-on:click="downloadData">Download Data</button>
      <progress v-else class="progress is-info" :value="downloadProgress" max="100">{{downloadProgress}}%</progress>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="getFirmware">Get Firmware</button>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="getNMEASettings">Get NMEA Settings</button>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="getUpdateRate">Get Update Rate</button>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="clearLog">Clear Log</button>
      <br><br>
      <button class="button is-link is-outlined">Upload data to firebase</button>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="requestDevice">Connect different device</button>
    </template>
    <template v-else>
      <p>Please connect the Skunksports GPS Tracker and make sure it is turned on</p>
      <br>
      <button class="button is-link is-outlined" v-on:click="requestDevice">Connect</button>
      <div v-if="isWindows">
        <a href="https://shiro.ch/usb_driver.zip">Download and install the Skunk Sports USB driver</a>
      </div>


    </template>
    <p class="status-text" v-if="device !== null">Device "{{device.productName}}" is {{opened ? 'open' : 'closed'}}</p>
  </div>
</template>

<script>
/* eslint no-console: "off" */
/* eslint no-unused-vars: ["error", { "args": "none" }] */
/* eslint no-unused-vars: "off" */
/* eslint no-constant-condition: "off" */

const vendorId = 0x0e8d;
const productId = 0x3329;
const interfaceNumber = 0;
const flashSize = 4 * 1024 * 1024; // 4 Mb or 200,000 records
const SIZEOF_CHUNK = 0x0800; // 2048
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export default {
  name: 'UploadGPS',
  props: {
    msg: String
  },
  data() {
    return {
      name: '',
      isConnected: false,
      wrongBrowser: false,
      device: null,
      opened: false,
      isWindows: false,
      downloadProgress: 0,
      responseCallback: {},
    }
  },
  mounted() {
    this.isWindows = navigator.platform.indexOf('Win') > -1;
    this.wrongBrowser = navigator.usb === undefined;
    if (navigator.usb === undefined) {
      return;
    }
    navigator.usb.getDevices().then(devices => {
      var d = devices.filter(function(d) {
        return d.vendorId === vendorId && d.productId === productId;
      });
      if (d.length === 0) {
        return;
      }
      if (d.length > 1) {
        console.info('Found multiple GPS Tracker connected to this app, using the first one');
      }
      this.device = d[0];
      window.device = this.device;
    });
    navigator.usb.addEventListener('connect', event => {
      console.log('connect', event.device);
      this.device = event.device;
    });
    navigator.usb.addEventListener('disconnect', event => {
      console.log('disconnect', event.device);
      this.device = null;
    });

    // polling "device.opened" because it is not observable
    setInterval(() => {
      if (this.device !== null) {
        this.opened = this.device.opened;
      }
    }, 1000)
  },
  methods: {
    startListening(e) {
      e.target.blur();
      e.target.disabled = true;
      (async () => {
        try {
          await this.device.open();
          if (this.device.configuration === null) {
            await this.device.selectConfiguration(1);
          }
          await this.device.claimInterface(1);

          // Sending a setup packet to the device.
          // Note: The GPS Tracker should always send with baud 115200
          // Why: We send setup packet on interface 1 and get data on interface 0?
          let result = await this.device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: 0x22,
            value: 0x13,
            index: 0x01 // interface number
          });

          await this.device.claimInterface(0);

          // TODO: do i need to send request or does data just come in?
          /*const command = '$PMTK182,2,8*33\r\n'
          const sent = await this.device.transferOut(1, encoder.encode(command))
          console.log('sent', sent)
          */



          console.log('reading data');
          var buffer = '';

          for (;;) {
            let res = await this.device.transferIn(1, 64);
            if (res.status === 'babble') {
              console.warn('device responds with more packets than expected');
            }
            if (res.status === 'stall') {
              console.warn('Endpoint stalled. Clearing.');
              await this.device.clearHalt(1);
              break; // TOOD: return
            }
            buffer = buffer + decoder.decode(res.data);
            for (;;) {
              // search buffer for end-of-line characters
              var i = buffer.indexOf('\r\n');
              if (i > -1) {
                var line = buffer.slice(0, i);
                buffer = buffer.slice(i + 2);
                if (!line.startsWith('$GP')) {

                  // starting with $PMTK001 are ACK for commands
                  // starting with $PMTK182,3,6 are answers for setting queries
                  if (line.startsWith('$PMTK182,3,')) {
                    let p = line.split(',').slice(0, 3).join(',');
                    if (this.responseCallback[p] !== undefined) {
                      let payload = line.slice(p.length + 1, line.lastIndexOf('*'));
                      this.responseCallback[p](payload);
                    }
                  } else if (line.startsWith('$PMTK')) {
                    // handling other responses
                    let p = line.split(',')[0];
                    if (this.responseCallback[p] !== undefined) {
                      let payload = line.slice(p.length + 1, line.lastIndexOf('*'));
                      this.responseCallback[p](payload);
                    }
                  }
                  console.log('found a line:', line);
                }
              } else {
                break;
              }
            }
          }

        } catch(e) {
          console.error(e);
        }
      })();
    },
    getFirmware(e) {
      // Note: it is possible to get the flash product out of the string https://github.com/kiah2008/androidmtk/blob/master/src/com/androidmtk/DownloadBinRunnable.java#L227
      this.responseCallback['$PMTK705'] = (payload) => {
        alert('Firmware Version: ' + payload);
      }
      var command = '$PMTK605*31\r\n';
      this.device.transferOut(1, encoder.encode(command))
    },
    getNMEASettings(e) {
      this.responseCallback['$PMTK514'] = (payload) => {
        alert('NMEA Settings: ' + payload);
      }
      var command = '$PMTK414*33\r\n';
      this.device.transferOut(1, encoder.encode(command))
    },
    getUpdateRate(e) {
      this.responseCallback['$PMTK500'] = (payload) => {
        alert('Update Rate: ' + payload);
      }
      var command = '$PMTK400*36\r\n';
      this.device.transferOut(1, encoder.encode(command))
    },
    clearLog(e) {
      e.target.blur();
      // reference implementation https://github.com/kiah2008/androidmtk/blob/master/src/com/androidmtk/DeleteRunnable.java#L31

    },
    downloadData(e) {
      e.target.blur();
      this.responseCallback['$PMTK592'] = (payload) => {
        console.log('Mac address: ' + fixPMTKMacAddress(payload));
      }
      var command = '$PMTK492*3D\r\n';
      this.device.transferOut(1, encoder.encode(command));
      (async () => {
        try {
          this.responseCallback['$PMTK182,3,6'] = (payload) => {
            console.log('recording mode:', payload === '1' ? 'overwrite' : 'stop');
          }
          // Query recording mode: 1=overwrite and flash is full, 2=stop
          var command = '$PMTK182,2,6*3D\r\n';
          var res = await this.device.transferOut(1, encoder.encode(command))

          this.responseCallback['$PMTK182,3,8'] = (payload) => {
            console.log('memory used:', payload) //(%08x)
          }
          // Query the RCD_ADDR (data log Next Write Address).
          // TODO: should memory used not return the full memory used in overwrite?
          command = '$PMTK182,2,8*33\r\n';
          res = await this.device.transferOut(1, encoder.encode(command))




        } catch(e) {
          console.error(e);
        }
      })();
    },
    requestDevice(e) {
      e.target.blur();
      navigator.usb.requestDevice({ filters: [{ vendorId: vendorId }] })
      .then(selectedDevice => {
        this.device = selectedDevice;
        window.device = this.device;
      })
      .catch(error => { console.log(error); });
    }
  }
}

// NEMAChecksum taken from http://www.hhhh.org/wiml/proj/nmeaxor.html
function NMEAChecksum(cmd) {
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

function fixPMTKMacAddress(mac) {
  return mac.match(/.{1,2}/g).reverse().join(':');
}

</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

.status-text {
  position: fixed;
  bottom: 40px;
  left: 40px;
}

h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
