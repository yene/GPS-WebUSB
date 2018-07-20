# GPS with WebUSB

Reading GPS data from Qstarz BT-Q1300ST.

Code is heavily inspired by [GPSBabel](https://github.com/gpsbabel/gpsbabel)

## TOOO
* Make sure host has HTTPS.
* Make sure the webserver redirects http to https with 301.
* use the node module `webusb` for faster testing.

## commands
`npm run serve`
`node node_modules/eslint/bin/eslint.js --fix --ext .js,.vue src`

## Notes
* debug USB with `chrome://device-log`
* ES6 has binary literals like `0b111110111`
* Before download disable logging, so it does not interfere with the download data, enable after download.

## Material
* [mtk_logger.cc](https://github.com/gpsbabel/gpsbabel/blob/master/mtk_logger.cc)
