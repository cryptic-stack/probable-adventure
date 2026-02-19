<template>
  <div>
    <v-table density="comfortable">
      <thead>
        <tr>
          <th>Deployment</th>
          <th>Name</th>
          <th v-if="!usesMux">Max connections</th>
          <th>Neko image</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
          <th>Destroy</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in rooms" :key="item.id">
          <td>
            <v-btn @click="openInfo(item.id)" color="blue" size="small" class="mr-2" variant="tonal" icon="mdi-information-outline" />
            <v-btn :disabled="!item.running" :href="item.url" target="_blank" size="small" variant="tonal" icon="mdi-open-in-new" />
          </td>
          <td>{{ item.name }}</td>
          <td v-if="!usesMux">
            <span v-if="item.max_connections > 0">{{ item.max_connections }}</span>
            <i v-else>uses mux</i>
          </td>
          <td>
            <RoomActionBtn action="recreate" :room-id="item.id" />
            <span class="ml-3">{{ item.neko_image }}</span>
            <v-icon v-if="item.is_outdated" class="ml-2" color="warning">mdi-update</v-icon>
          </td>
          <td>
            <v-chip :color="item.running ? (String(item.status).includes('unhealthy') ? 'warning' : 'green') : 'red'" size="small">
              {{ item.status }}
            </v-chip>
          </td>
          <td>{{ formatTimeago(item.created) }}</td>
          <td>
            <RoomActionBtn action="start" :room-id="item.id" :disabled="item.running" />
            <RoomActionBtn action="stop" :room-id="item.id" :disabled="!item.running && !item.paused" />
            <RoomActionBtn action="pause" :room-id="item.id" :disabled="!item.running" />
            <RoomActionBtn action="restart" :room-id="item.id" :disabled="!item.running" />
          </td>
          <td>
            <RoomActionBtn action="remove" :room-id="item.id" />
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-dialog v-model="dialog" max-width="920px">
      <v-card>
        <v-card-title class="headline">Room information</v-card-title>
        <v-card-text>
          <RoomInfo v-if="dialog" :room-id="roomId" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="grey" variant="text" @click="dialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import RoomInfo from '@/components/RoomInfo.vue'
import RoomActionBtn from '@/components/RoomActionBtn.vue'
import { formatTimeago } from '@/plugins/filters'
import type { RoomEntry } from '@/api/index'
import type { State } from '@/store/state'

defineProps<{ loading?: boolean }>()

const store = useStore<State>()
const dialog = ref(false)
const roomId = ref('')

const rooms = computed<RoomEntry[]>(() => store.state.rooms || [])
const usesMux = computed<boolean>(() => Boolean(store.state.roomsConfig?.uses_mux))

const openInfo = (id: string) => {
  roomId.value = id
  dialog.value = true
}
</script>
