<template>
  <div>
    <div v-if="settingsLoading" class="text-center">
      <v-progress-circular :size="70" :width="7" color="blue" indeterminate />
    </div>

    <v-alert border="start" type="warning" v-else-if="!settings">
      <p><strong>Room not loaded.</strong></p>
      <p class="mb-0">Check connectivity and try recreating the room.</p>
    </v-alert>

    <template v-else>
      <div class="my-3 text-h6">Room members</div>
      <v-row v-if="stats">
        <v-col class="text-center">
          <div class="mb-3">
            <v-progress-circular
              :rotate="270"
              :size="100"
              :width="15"
              :model-value="settings.max_connections === 0 ? 100 : (stats.connections / settings.max_connections) * 100"
              color="blue"
            >
              {{ stats.connections }} <template v-if="settings.max_connections > 0">/ {{ settings.max_connections }}</template>
            </v-progress-circular>
          </div>
        </v-col>
        <v-col>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Display name</th>
                <th class="text-center">Hosting</th>
                <th class="text-center">Admin</th>
                <th class="text-center">Muted</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in stats.members" :key="member.id">
                <td>{{ member.displayname }}</td>
                <td class="text-center"><v-icon :color="stats.host === member.id ? 'green' : 'red'">mdi-keyboard</v-icon></td>
                <td class="text-center"><v-icon :color="member.admin ? 'green' : 'red'">mdi-shield-check</v-icon></td>
                <td class="text-center"><v-icon :color="member.muted ? 'red' : 'green'">mdi-volume-high</v-icon></td>
              </tr>
              <tr v-if="stats.members.length === 0">
                <td colspan="4" class="text-center">no members</td>
              </tr>
            </tbody>
          </v-table>
        </v-col>
      </v-row>

      <v-alert border="start" type="warning" v-if="statsErr && room?.running" class="mb-2">
        <p><strong>Room stats are not available.</strong></p>
        <p class="mb-0">{{ statsErr }}</p>
      </v-alert>

      <div class="text-center mt-3">
        <v-btn @click="loadStats" :loading="statsLoading" :disabled="!room?.running">Reload</v-btn>
      </div>

      <div class="my-3 text-h6">Main settings</div>
      <v-table>
        <tbody>
          <tr><th style="width:50%;">Name</th><td>{{ settings.name }}</td></tr>
          <tr><th>Neko image</th><td>{{ settings.neko_image }}</td></tr>
          <tr><th>User password</th><td><RoomLink :room-id="roomId" :password="settings.user_pass" label="invite link for users" /></td></tr>
          <tr><th>Admin password</th><td><RoomLink :room-id="roomId" :password="settings.admin_pass" label="invite link for admins" /></td></tr>
          <tr v-if="!usesMux"><th>Max connections</th><td>{{ settings.max_connections }}</td></tr>
          <tr><th>Control protection</th><td>{{ settings.control_protection }}</td></tr>
          <tr><th>Implicit control</th><td>{{ settings.implicit_control }}</td></tr>
          <tr><th>Created</th><td>{{ formatDatetime(room?.created || '') }}</td></tr>
          <tr><th>CPUs</th><td>{{ formatNanocpus(settings.resources.nano_cpus || 0) }}</td></tr>
          <tr><th>Memory</th><td>{{ formatMemory(settings.resources.memory || 0) }}</td></tr>
          <tr><th>Shared memory</th><td>{{ formatMemory(settings.resources.shm_size || 0) }}</td></tr>
          <tr><th>Hostname</th><td>{{ settings.hostname || '--' }}</td></tr>
        </tbody>
      </v-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { useStore } from 'vuex'
import type { AxiosError } from 'axios'
import RoomLink from './RoomLink.vue'
import { formatDatetime, formatMemory, formatNanocpus } from '@/plugins/filters'
import type { RoomEntry, RoomMember, RoomSettings, RoomStats } from '@/api/index'
import type { State } from '@/store/state'

const props = defineProps<{ roomId: string }>()

const store = useStore<State>()
const vm = getCurrentInstance()

const statsLoading = ref(false)
const statsErr = ref('')
const stats = ref<RoomStats | null>(null)
const settingsLoading = ref(false)
const settings = ref<RoomSettings | null>(null)

const room = computed<RoomEntry | undefined>(() => store.state.rooms.find(({ id }) => id === props.roomId))
const usesMux = computed<boolean>(() => Boolean(store.state.roomsConfig?.uses_mux))

const swal = (opts: Record<string, unknown>) => vm?.proxy?.$swal?.(opts)

const loadStats = async () => {
  statsLoading.value = true

  try {
    const loadedStats = await store.dispatch('ROOMS_STATS', props.roomId)
    loadedStats.members.sort((a: RoomMember, b: RoomMember) => {
      const nameA = a.displayname?.toUpperCase() || ''
      const nameB = b.displayname?.toUpperCase() || ''
      if (nameA < nameB) return -1
      if (nameA > nameB) return 1
      return 0
    })
    stats.value = loadedStats
    statsErr.value = ''
  } catch (e) {
    const response = (e as AxiosError).response
    statsErr.value = response ? `Server error: ${response.data}` : `Network error: ${String(e)}`
  } finally {
    statsLoading.value = false
  }
}

const loadRoom = async (roomId: string) => {
  stats.value = null
  statsErr.value = ''
  settings.value = null
  settingsLoading.value = true

  try {
    settings.value = await store.dispatch('ROOMS_SETTINGS', roomId)
    if (room.value?.running) {
      await loadStats()
    }
  } catch (e) {
    const response = (e as AxiosError).response
    await swal({
      title: response ? 'Server error' : 'Network error',
      text: response ? String(response.data) : String(e),
      icon: 'error',
    })
  } finally {
    settingsLoading.value = false
  }
}

watch(() => props.roomId, (roomId) => {
  if (roomId) {
    void loadRoom(roomId)
  }
}, { immediate: true })

watch(() => room.value?.status, () => {
  if (room.value?.running) {
    void loadStats()
  }
})
</script>
