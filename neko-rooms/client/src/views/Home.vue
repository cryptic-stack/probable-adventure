<template>
  <v-row class="mb-4" align="center">
    <v-col cols="12" md="8">
      <h1 class="text-h4">Rooms</h1>
      <p class="text-medium-emphasis mb-0">Manage rooms, quick launch, and image pull status.</p>
    </v-col>
    <v-col cols="12" md="4" class="text-md-right d-flex ga-2 justify-md-end">
      <Pull />
      <RoomsQuick />
      <v-btn color="primary" :loading="loading" @click="loadRooms">Refresh</v-btn>
    </v-col>
  </v-row>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

  <v-card class="mb-4">
    <v-card-title class="d-flex justify-space-between align-center">
      <span>Create room</span>
      <v-btn size="small" variant="text" @click="showCreate = !showCreate">{{ showCreate ? 'Hide' : 'Show' }}</v-btn>
    </v-card-title>
    <v-expand-transition>
      <div v-if="showCreate" class="pa-4 pt-0">
        <RoomsCreate @finished="onCreateFinished" />
      </div>
    </v-expand-transition>
  </v-card>

  <v-card>
    <v-card-title>Room list</v-card-title>
    <v-card-text>
      <RoomsList :loading="loading" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useStore } from 'vuex'
import type { AxiosError } from 'axios'
import Pull from '@/components/Pull.vue'
import RoomsQuick from '@/components/RoomsQuick.vue'
import RoomsCreate from '@/components/RoomsCreate.vue'
import RoomsList from '@/components/RoomsList.vue'
import type { State } from '@/store/state'

const store = useStore<State>()
const loading = ref(false)
const error = ref('')
const showCreate = ref(true)

const loadRooms = async () => {
  error.value = ''
  loading.value = true

  try {
    await store.dispatch('ROOMS_CONFIG')
    await store.dispatch('ROOMS_LOAD')
  } catch (e) {
    const response = (e as AxiosError).response
    error.value = response ? `Server error: ${JSON.stringify(response.data)}` : `Network error: ${String(e)}`
  } finally {
    loading.value = false
  }
}

const onCreateFinished = async () => {
  showCreate.value = false
  await loadRooms()
}

void loadRooms()
</script>
