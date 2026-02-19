<template>
  <span>
    <v-btn @click="dialog = true" :loading="loading" color="info">
      <v-icon class="mr-2" color="white">{{ status.active ? 'mdi-cloud-sync' : 'mdi-cloud-download-outline' }}</v-icon>
      Pull neko images
    </v-btn>

    <v-dialog v-model="dialog" max-width="780px">
      <v-card>
        <v-card-title class="headline">Pull neko images</v-card-title>
        <v-card-text>
          <template v-if="status.active && status.layers && status.layers.length > 0">
            <pre v-for="layer in status.layers" :key="layer.id">{{ layer.id }} {{ layer.status }}{{ layer.progress ? ' ' + layer.progress : '' }}</pre>
            <br />
          </template>
          <template v-if="status.status && status.status.length > 0">
            <pre v-for="text in status.status" :key="text">{{ text }}</pre>
          </template>
          <pre v-else-if="status.active">Preparing docker image pull</pre>
        </v-card-text>
        <v-card-actions>
          <template v-if="!status.active">
            <v-select v-model="nekoImage" :items="nekoImages" density="compact" variant="outlined" hide-details label="Neko image" />
            <v-btn color="green" class="ml-2" :loading="loading" @click="start">Start</v-btn>
          </template>
          <v-spacer v-else />
          <v-btn v-if="status.active" color="red" variant="text" :loading="loading" @click="stop">Stop</v-btn>
          <v-btn color="grey" variant="text" @click="dialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </span>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import type { AxiosError } from 'axios'
import type { PullStatus } from '@/api/index'
import type { State } from '@/store/state'

const store = useStore<State>()
const vm = getCurrentInstance()

const dialog = ref(false)
const loading = ref(false)
const nekoImage = ref('')

const status = computed<PullStatus>(() => store.state.pullStatus)
const nekoImages = computed<string[]>(() => store.state.roomsConfig.neko_images || [])
const swal = (opts: Record<string, unknown>) => vm?.proxy?.$swal?.(opts)

const start = async () => {
  loading.value = true
  try {
    await store.dispatch('PULL_START', nekoImage.value)
  } catch (e) {
    const response = (e as AxiosError).response
    await swal({
      title: response ? 'Server error' : 'Network error',
      text: response ? String(response.data) : String(e),
      icon: 'error',
    })
  } finally {
    loading.value = false
  }
}

const stop = async () => {
  loading.value = true
  try {
    await store.dispatch('PULL_STOP')
  } catch (e) {
    const response = (e as AxiosError).response
    await swal({
      title: response ? 'Server error' : 'Network error',
      text: response ? String(response.data) : String(e),
      icon: 'error',
    })
  } finally {
    loading.value = false
    dialog.value = false
  }
}

const pullStatus = async () => {
  try {
    await store.dispatch('PULL_STATUS')
  } catch (e) {
    const response = (e as AxiosError).response
    if (response) {
      // eslint-disable-next-line no-console
      console.error('Server error', response.data)
    } else {
      // eslint-disable-next-line no-console
      console.error('Network error', String(e))
    }
  }
}

let interval = 0

onMounted(async () => {
  await pullStatus()
  interval = window.setInterval(async () => {
    if (!status.value.active) return
    await pullStatus()
  }, 1000)
})

onBeforeUnmount(() => {
  window.clearInterval(interval)
})
</script>
