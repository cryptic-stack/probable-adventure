import { createApp } from 'vue'
import App from './App.vue'
import store from './store'
import vuetify from './plugins/vuetify'
import sweetalert from './plugins/sweetalert'
import '@mdi/font/css/materialdesignicons.css'
import '@/assets/styles/main.scss'

createApp(App).use(store).use(vuetify).use(sweetalert).mount('#app')
