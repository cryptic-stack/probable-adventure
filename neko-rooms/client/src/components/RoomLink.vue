<template>
  <div class="d-flex align-center ga-2">
    <v-text-field
      ref="input"
      :append-inner-icon="showPass ? 'mdi-eye' : 'mdi-eye-off'"
      :model-value="showPass ? password : '*****'"
      @click:append-inner="togglePass"
      @click="showPass && selectAll()"
      @focus="showPass && selectAll()"
      hide-details
      variant="outlined"
      density="compact"
      readonly
    />

    <v-tooltip location="bottom" v-if="room">
      <template #activator="{ props: tooltipProps }">
        <v-btn v-bind="tooltipProps" :disabled="!room.running" :href="url" target="_blank" size="small" variant="tonal" icon="mdi-open-in-new" />
      </template>
      <span>{{ label }}</span>
    </v-tooltip>

    <v-tooltip location="bottom" v-if="room">
      <template #activator="{ props: tooltipProps }">
        <v-btn v-bind="tooltipProps" :disabled="!room.running" @click="copyToClipboard" size="small" variant="tonal" :icon="copied ? 'mdi-clipboard-check-multiple' : 'mdi-clipboard-multiple-outline'" />
      </template>
      <span>copy link to clipboard</span>
    </v-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import type { RoomEntry } from '@/api/index'
import type { State } from '@/store/state'

const props = defineProps<{
  roomId: string;
  password: string;
  label: string;
}>()

const store = useStore<State>()
const input = ref<any>(null)
const showPass = ref(false)
const copied = ref(false)

const room = computed<RoomEntry | undefined>(() => store.state.rooms.find(({ id }) => id === props.roomId))
const url = computed(() => `${room.value?.url || ''}?pwd=${encodeURIComponent(props.password)}`)

const togglePass = () => {
  showPass.value = !showPass.value
  if (showPass.value) {
    window.setTimeout(selectAll, 0)
  }
}

const selectAll = () => {
  const el = input.value?.$el?.querySelector?.('input') as HTMLInputElement | null
  el?.select()
}

let copiedTimeout = 0

const copyToClipboard = () => {
  if (copiedTimeout) {
    window.clearTimeout(copiedTimeout)
  }

  void navigator.clipboard.writeText(url.value)
  copied.value = true

  copiedTimeout = window.setTimeout(() => {
    copied.value = false
    copiedTimeout = 0
  }, 3000)
}
</script>
