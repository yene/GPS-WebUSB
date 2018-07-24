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
      <button v-if="downloadProgress === 0" class="button is-link is-outlined" v-on:click="downloadLog">Download Log</button>
      <template v-else>
      <progress class="progress is-info" :value="downloadProgress" max="100">{{downloadProgress}}%</progress>
      <!-- <button class="button is-link is-outlined" v-on:click="killDownload">Stop Download</button> -->
      </template>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="mtkLogger">use mtk_logger</button>

      <br><br>
      <button class="button is-link is-outlined" v-on:click="getFirmware">Get Firmware</button>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="getNMEASettings">Get NMEA Settings</button>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="getUpdateRate">Get Update Rate</button>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="clearLog">Reset Tracker</button>

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
/* eslint 'semi': ['warn', 'always'] */

import * as utils from '@/utils/utils.js';
import MTKLogger from '@/utils/MTKLogger.js';

const vendorId = 0x0e8d;
const productId = 0x3329;
const interfaceNumber = 0;
const flashSize = 4 * 1024 * 1024; // 4 Mb or 200,000 records
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const guessedDownloadTime = 42 * 1000;

const chunkSizeToRequest = 0x800; // 2048

export default {
  name: 'UploadGPS',
  data() {
    return {
      isConnected: false,
      wrongBrowser: false,
      device: null,
      opened: false,
      isWindows: false,
      downloadProgress: 0,
      responseCallback: {},
      data: '',
    };
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
      this.startListening();
      window.device = this.device; // TODO: remove this debug line
    });
    navigator.usb.addEventListener('connect', event => {
      console.log('connect', event.device);
      this.device = event.device;
      this.startListening();
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
    }, 1000);
  },
  methods: {
    mtkLogger(e) {
      var mtkLogger = new MTKLogger(this.device);
      mtkLogger.mtk_rd_init();


    },
    killDownload(e) {
      clearInterval(this.timer);
      this.downloadProgress = -1;
      this.device.clearHalt('in', 1);
      this.device.clearHalt('out', 1);
    },
    startListening() {
      if (this.opened) {
        console.error('Device is already open');
        return;
      }

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

          console.log('starting serial stream');
          var buffer = '';
          for (;;) {
            let res = await this.device.transferIn(1, 64);
            if (res.status === 'babble') {
              console.warn('device responds with more packets than expected');
            }
            if (res.status === 'stall') {
              console.warn('Endpoint stalled. Clearing.');
              await this.device.clearHalt('in', 1);
              break; // TOOD: return
            }
            buffer = buffer + decoder.decode(res.data);
            for (;;) {
              // search buffer for end-of-line characters
              var i = buffer.indexOf('\r\n');
              if (i == -1) {
                break;
              }
              var line = buffer.slice(0, i);
              buffer = buffer.slice(i + 2);

              if (line.charAt(0) !== '$') {
                console.info('Dropping line without $:', line);
                continue;
              }

              let payload = line.slice(1, line.lastIndexOf('*'));
              var calculatedChecksum = utils.NMEAChecksum(payload);
              var payloadChecksum = line.slice(line.lastIndexOf('*') + 1);
              if (calculatedChecksum !== payloadChecksum) {
                console.info('Invalid checksum found, dropping line', line);
                console.info('i calculated checksum', calculatedChecksum, 'but it was', payloadChecksum);
                //debugger;
              }

              if (line.startsWith('$GP')) { // ignore live updates over serial
                continue;
              }
              if (line.startsWith('$PMTK001')) {
                if (this.responseCallback[line] !== undefined) {
                  this.responseCallback[line]();
                }
                if (line.split(',')[3] !== '3') {
                  console.error('BAD ACK:', line)
                } else {
                  console.log('ACK:', line);
                }
                continue;
              } else if (line.startsWith('$PMTK182,8,')) { // receiving log data
                let prefix = '$PMTK182,8,';
                if (this.responseCallback[prefix] !== undefined) {
                  let payload = line.slice(prefix.length, line.lastIndexOf('*'));
                  this.responseCallback[prefix](payload);
                  continue;
                }
              } else if (line.startsWith('$PMTK182,3,')) { // starting with $PMTK182,3,6 are answers for setting queries
                let p = line.split(',').slice(0, 3).join(',');
                if (this.responseCallback[p] !== undefined) {
                  let payload = line.slice(p.length + 1, line.lastIndexOf('*'));
                  this.responseCallback[p](payload);
                  continue;
                }
              } else if (line.startsWith('$PMTK')) { // handling other responses
                let p = line.split(',')[0];
                if (this.responseCallback[p] !== undefined) {
                  let payload = line.slice(p.length + 1, line.lastIndexOf('*'));
                  this.responseCallback[p](payload);
                  continue;
                }
              }
              console.log('found line:', line);
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
      };
      var command = '$PMTK605*31\r\n';
      this.device.transferOut(1, encoder.encode(command));
    },
    getNMEASettings(e) {
      this.responseCallback['$PMTK514'] = (payload) => {
        alert('NMEA Settings: ' + payload);
      };
      var command = '$PMTK414*33\r\n';
      this.device.transferOut(1, encoder.encode(command));
    },
    getUpdateRate(e) {
      this.responseCallback['$PMTK500'] = (payload) => {
        alert('Update Rate: ' + payload);
      };
      var command = '$PMTK400*36\r\n';
      this.device.transferOut(1, encoder.encode(command));
    },
    clearLog(e) {
      e.target.blur();
      // TODO: this takes some time: better block UI
      this.responseCallback['$PMTK001,182,6,3*21'] = (payload) => {
        console.log('Erase complete');
      };
      var command = '$PMTK182,6,1*3E\r\n';
      this.device.transferOut(1, encoder.encode(command));
    },
    downloadLog(e) {
      e.target.blur();
      this.downloadProgress = 1;
      this.timer = setInterval(() => {
        this.downloadProgress = this.downloadProgress + 1;
        if (this.downloadProgress === 100) {
          clearInterval(this.timer);
          this.downloadProgress = -1;
        }
      }, guessedDownloadTime/100);


      var command = '$PMTK182,5*20\r\n'; // DISABLE LOG
      this.device.transferOut(1, encoder.encode(command));

      this.responseCallback['$PMTK592'] = (payload) => {
        console.log('Mac address: ' + utils.fixPMTKMacAddress(payload));
      };
      command = '$PMTK492*3D\r\n';
      this.device.transferOut(1, encoder.encode(command));
      (async () => {
        try {
          this.responseCallback['$PMTK182,3,6'] = (payload) => {
            console.log('recording mode:', payload === '1' ? 'overwrite' : 'stop');
          };
          // Query recording mode: 1=overwrite and flash is full, 2=stop
          var command = '$PMTK182,2,6*3D\r\n';
          await this.device.transferOut(1, encoder.encode(command));

          this.responseCallback['$PMTK182,3,8'] = (payload) => {
            console.log('memory used:', payload); //(%08x)
          };
          // Query the RCD_ADDR (data log Next Write Address).
          // TODO: should memory used not return the full memory used in overwrite?
          command = '$PMTK182,2,8*33\r\n';
          await this.device.transferOut(1, encoder.encode(command));


          // requesting data
          var offset = 0;
          var size = 1024;
          var chunkSize = 65536;
          // callback for when chunks arrive
          this.responseCallback['$PMTK182,8,'] = (payload) => {
            var p = payload.split(',');
            if (p.length !== 2) {
              return;
            }
            var startAddress = p[0];
            var data = p[1];
            console.log('received data from:', startAddress);
            this.data = this.data + data;
          };
          // ACK when download is finished
          this.responseCallback['$PMTK001,182,7,3*20'] = () => {
            console.log('finished download', this.data.length);
            console.timeEnd();
            var end = 'AAAAAAAAAAA0700010000BBBBBBBB';
            utils.downloadData(this.data.slice(0, this.data.lastIndexOf(end) + end.length), 'tracker_data.hex', 'text/plain');
            window.data = this.data; // TODO: remove this debug line
          };

          command = `$PMTK182,7,${utils.number2hex(offset)},${utils.number2hex(flashSize)}`;
          command = command + '*' + utils.NMEAChecksum(command) + '\r\n';
          this.device.transferOut(1, encoder.encode(command));
          console.time();
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
        this.startListening();
        window.device = this.device; // TODO: remove this debug line
      })
      .catch(error => { console.log(error); });
    }
  }
};

</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

.gps {
  padding-left: 40px;
  padding-right: 40px;
}

progress {
  margin: 0;
}

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
