# GPS with WebUSB

Reading GPS data from Qstarz BT-Q1300ST

## TOOO
* Make sure host has https

## commands
`npm run serve`
`node node_modules/eslint/bin/eslint.js --fix --ext .js,.vue src`

## Getting the data
PMTK182,2,8 gets the memory, but...

> Memory Used (warning: in overwrite mode, only returns from start of log to current position)




## webusb interfaces
interface 0
- endpoint 1: in/out, type bulk

interface 1
- endpoint 2: in, type interrupt


## Notes
* debug USB with `chrome://device-log`

