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
      <button class="button is-link is-outlined" v-on:click="downloadData">Download Data</button>
      <br><br>
      <button class="button is-link is-outlined" v-on:click="liveUpdate">Live Update</button>
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

export default {
  name: 'UploadGPS',
  props: {
    msg: String
  },
  data() {
    return {
      isConnected: false,
      wrongBrowser: false,
      device: null,
      opened: false,
      isWindows: false,
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

    // polling opened because it is not observable
    setInterval(() => {
      if (this.device !== null) {
        this.opened = this.device.opened;
      }
    }, 1000)
  },
  methods: {
    liveUpdate(e) {
      e.target.blur();
      (async () => {
        try {
          await this.device.open();
          if (this.device.configuration === null) {
            await this.device.selectConfiguration(1);
          }
          await this.device.claimInterface(1);

          //await this.device.selectAlternateInterface(1, 0);

          // TODO: where do these values come from
          let result = await this.device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: 0x22, // vendor-specific request: enable channels
            value: 0x13, // 0b00010011 (channels 1, 2 and 5)
            index: 0x01 // Interface 1 is the recipient
          })

          await this.device.claimInterface(0);
          console.log('open port on interface 1', result)
            const command = '$PMTK182,2,8*33\r\n'

          const enc = new TextEncoder()

          const sent = await this.device.transferOut(1, enc.encode(command))
          console.log('sent', sent)
          const decoder = new TextDecoder()
          while(true) {
            let res = await this.device.transferIn(1, 1024)
            console.log(decoder.decode(res.data))
          }

/*
          console.log('waiting for data');
while (true) {
  let result = await this.device.transferIn(2, 8); // 2^12

  if (result.data) {
    console.log(result.data, result.status)
    var enc = new TextDecoder();
    console.log(enc.decode(result.data));
  }

  if (result.status === 'stall') {
    console.warn('Endpoint stalled. Clearing.');
    await window.device.clearHalt(1);
  }
}*/


        } catch(e) {
          console.error(e);
        }
      })();
    },
    downloadData(e) {
      e.target.blur();
      (async () => {
        try {
          await this.device.open();
          if (this.device.configuration === null) {
            await this.device.selectConfiguration(1);
          }
          await this.device.claimInterface(0);

          await this.device.selectAlternateInterface(0, 0);

          //let buf = new Uint8Array(1);
          // $PMTK492*3D\r\n

          //buf[0] = 0x30;
          // $PMTK492*3D\r\n
          var queryUpdateRate = '$PMTK400*36\r\n\0'
          // 24504d544b3430302a3336 0d 0a 00
          var buf = Buffer.from(queryUpdateRate, 'ascii');
          console.log('query update rate', buf.toString('hex'));

          var res2 = await this.device.transferOut(1, buf);
          //console.log('did send and receive', res2);

          console.log('waiting for 19 bytes on endpoint 1')
          var res = await this.device.transferIn(1, 19);
          console.log('got data', res);

          var sizeBuff = res.data;
          var size = sizeBuff.getUint32(0);
          console.log("size = " + size);

          var bToRead = size;

          if ((bToRead % 64) != 0) {
            bToRead++;	// <-- Needed otherwise some data is lost (might be a bug in firmware, unlikely though)
          }

          var datas = await this.device.transferIn(1, bToRead);
          console.log(datas);

        } catch(e) {
          console.error(e);
        }
      })();

      /*
      this.device.open()
      .then(() => {
        return this.device.selectConfiguration(1)
      })
      .then(() => {
        return this.device.claimInterface(interfaceNumber)
      })
      /*
      .then(() => this.device.controlTransferOut({
          requestType: 'class',
          recipient: 'interface',
          request: 0x22,
          value: 0x01,
          index: 0x02})) // Ready to receive data
      .then(() => this.device.transferIn(5, 64)) // Waiting for 64 bytes of data from endpoint #5.
      .then(result => {
        let decoder = new TextDecoder();
        console.log('Received: ' + decoder.decode(result.data));
      })
      .then(result => {
        //return this.device.close();
      })
      .catch(error => { console.log(error); });
      */
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

// buf2hex converts an ArrayBuffer to a hex string
function buf2hex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
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
