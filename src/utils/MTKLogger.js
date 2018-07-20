/* eslint no-console: "off" */
/* eslint no-unused-vars: ["error", { "args": "none" }] */
/* eslint no-unused-vars: "off" */
/* eslint no-constant-condition: "off" */
/* eslint 'semi': ['warn', 'always'] */
/* eslint no-debugger: "off" */


const CMD_LOG_DISABLE = "$PMTK182,5*20\r\n";
const CMD_LOG_ENABLE = "$PMTK182,4*21\r\n";
const CMD_LOG_FORMAT = "$PMTK182,2,2*39\r\n";
const CMD_LOG_ERASE = "$PMTK182,6,1*3E\r\n";
const CMD_LOG_STATUS = "$PMTK182,2,7*3C\r\n";
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const TIMEOUT = 1500;

/* Flags returned from PMTK001 ack packet */
const MTK_ACK = ['Invalid packet', 'Unsupported packet type', 'Valid packet but action failed', 'Valid packet, action success'];

export default class MTKLogger {
  // device is a webusb object, which is already open and configured.
  constructor(device) {
    this.device = device;
  }

  async mtk_rd_init() {
    // Open serial port with 115200, 8, 0, 1
    // of course this is not needed because we use WebUSB

    let {result, error} = await this.do_cmd("$PMTK605*31\r\n", "PMTK705,", 10);
    if (error !== null) {
      console.error('This is not a MTK based GPS! (or is device turned off?)');
      return;
    }
    console.log(result);
}

  // do_cmd returns {result: '', error: null|''}
  async do_cmd(cmd, expect, timeout_sec = 1) {
    var tout = new Date();
    tout.setSeconds(tout.getSeconds() + timeout_sec);

    var cmd_erase = false;
    if (cmd.includes(CMD_LOG_ERASE)) {
      cmd_erase = true;
    }

    this.do_send_cmd(cmd);

    var done = false;
    var loops = 0;
    var result = '';

    do {
      var {line, error} = await this.read_line(this.device, TIMEOUT, '\r\n');
      if (error !== null) {
        console.log('read line error', error);
        return {result: '', error: error};
      }
      loops++;
      console.log('Read', line.length, 'bytes: ', line);

      if (cmd_erase) {
        console.log('Erase in progress', loops);
      }

      if (line.length > 5 && line.charAt(0) === '$') {
        if (line.includes(expect)) {
          console.log('NMEA command success!');
          if (cmd.length - '$*XX'.length - expect.length > 0) { // check if we have a payload
            if (line.charAt(line.length - 3) === '*') {
              line = line.slice(0, -3); // cut off checksum
            }
            result = line.slice(expect.length + 1); // cut off cmd
          }
          done = true;
        }
      } else if (line.startsWith('$PMTK')) {
        /* A quick parser for ACK packets */
        if (!cmd_erase && line.startsWith('$PMTK001,') && line.length != 9) {
          var p = line.split(',');
          var pAck = Number(p[3]);
          if (pAck !== 3 && pAck > 0 && pAck < 4) { // Erase will return '2'
            console.error('NMEA command "', cmd, '" failed', MTK_ACK[pAck]);
            return {result: '', error: 'NMEA command failed'};
          }
        }
        console.log('RECV:', line);
      }

      var now = new Date();
      if (!done && now > tout) {
        console.error('NMEA command "', cmd, '" timeout');
        return {result: '', error: 'NMEA command timeout'};
      }

    } while (line.length > 0 && loops > 0 && !done);
    return {result: result, error: null};
  }
  async do_send_cmd(cmd) {
    console.log('Send', cmd);
    var rc = await this.device.transferOut(1, encoder.encode(cmd));
    if (rc.status !== 'ok') {
      console.error('Write error', rc);
      // TODO: fatal here, how to recover from it?
    } else {
      console.log('Write success', rc);
    }
  }

  // Read until eol character is found.
  async read_line(device, timeout_ms, eol) {
    var time = new Date().getTime();
    var buffer = '';
    for (;;) {
      var time_left = timeout_ms - (new Date().getTime() - time);
      if (time_left <= 0) {
        return {line: '', error: 'read line timeout'};
      }

      let res = await device.transferIn(1, 64);
      if (res.status === 'babble') {
        console.warn('device responds with more packets than expected');
      }
      if (res.status === 'stall') {
        return {line: '', error: 'Endpoint stalled.'};
      }
      buffer = buffer + decoder.decode(res.data);
      for (;;) {
        // search buffer for end-of-line characters
        var i = buffer.indexOf(eol);
        if (i == -1) {
          break;
        }
        var line = buffer.slice(0, i);
        buffer = buffer.slice(i + eol.length);
        return {line: line, error: null};
      }
    }
  }
}
