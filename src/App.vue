<template>
  <div id="app">
    <img src="/img/logo.png">
    <UploadGPS/>
    <!-- footer https://skunksports.com/ -->
  </div>
</template>

<script>
import UploadGPS from './components/UploadGPS.vue'

export default {
  name: 'app',
  components: {
    UploadGPS
  },
  mounted() {
    if (location.host.includes('localhost')) {
      return;
    }
    if (location.protocol === 'http:') {
      window.location = 'https://' + location.host + location.pathname;
    }

  }
}
</script>

<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 20px;
  max-width: 600px;
  margin: auto;
}
</style>
