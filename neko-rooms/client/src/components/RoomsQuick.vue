<template>
  <span>
    <v-menu location="bottom" close-on-content-click>
      <template #activator="{ props: menuProps }">
        <v-btn v-bind="menuProps" :loading="loading" color="info">+ Quick room</v-btn>
      </template>

      <v-list>
        <v-list-item v-for="(nekoImage, index) in nekoImages" :key="index" @click="action(nekoImage)">
          <v-list-item-title>{{ nekoImage }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

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
  </span>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue'
import { useStore } from 'vuex'
import type { AxiosError } from 'axios'
import { randomPassword } from '@/utils/random'
import RoomInfo from '@/components/RoomInfo.vue'
import type { RoomSettings } from '@/api/index'
import type { State } from '@/store/state'

const store = useStore<State>()
const vm = getCurrentInstance()

const dialog = ref(false)
const loading = ref(false)
const roomId = ref('')

const nekoImages = computed<string[]>(() => store.state.roomsConfig.neko_images || [])
const swal = (opts: Record<string, unknown>) => vm?.proxy?.$swal?.(opts)

const action = async (nekoImage: string) => {
  loading.value = true

  try {
    const entry = await store.dispatch('ROOMS_CREATE_AND_START', {
      ...store.state.defaultRoomSettings,
      neko_image: nekoImage,
      user_pass: randomPassword(),
      admin_pass: randomPassword(),
    } as RoomSettings)

    roomId.value = entry.id
    dialog.value = true
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
</script>
