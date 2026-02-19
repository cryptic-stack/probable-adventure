<template>
  <v-tooltip location="bottom" v-if="templateDef">
    <template #activator="{ props: tooltipProps }">
      <v-btn
        v-bind="tooltipProps"
        @click="runAction"
        :color="templateDef.color"
        :disabled="disabled"
        :loading="loading"
        icon
        size="small"
        variant="text"
      >
        <v-icon>{{ templateDef.icon }}</v-icon>
      </v-btn>
    </template>
    <span>{{ templateDef.tooltip }}</span>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue'
import { useStore } from 'vuex'
import type { AxiosError } from 'axios'
import type { State } from '@/store/state'

const props = defineProps<{
  action: string;
  roomId: string;
  disabled?: boolean;
}>()

const store = useStore<State>()
const vm = getCurrentInstance()
const loading = ref(false)

const templateDef = computed(() => {
  switch (props.action) {
    case 'start':
      return { dispatch: 'ROOMS_START', msg: 'Room started!', tooltip: 'Start', color: 'green', icon: 'mdi-play-circle-outline' }
    case 'stop':
      return { dispatch: 'ROOMS_STOP', msg: 'Room stopped!', tooltip: 'Stop', color: 'warning', icon: 'mdi-stop-circle-outline' }
    case 'pause':
      return { dispatch: 'ROOMS_PAUSE', msg: 'Room paused!', tooltip: 'Pause', color: 'orange', icon: 'mdi-pause-circle-outline' }
    case 'restart':
      return { dispatch: 'ROOMS_RESTART', msg: 'Room restarted!', tooltip: 'Restart', color: 'blue', icon: 'mdi-refresh' }
    case 'recreate':
      return { dispatch: 'ROOMS_RECREATE', msg: 'Room recreated!', tooltip: 'Recreate', color: 'blue', icon: 'mdi-cloud-refresh' }
    case 'remove':
      return { dispatch: 'ROOMS_REMOVE', msg: 'Room removed!', tooltip: 'Remove', color: 'red', icon: 'mdi-trash-can-outline' }
    default:
      return undefined
  }
})

const swal = (opts: Record<string, unknown>) => vm?.proxy?.$swal?.(opts)

const runAction = async () => {
  if (!templateDef.value) return

  if (props.action === 'remove' || props.action === 'recreate') {
    const warning = props.action === 'remove'
      ? 'Do you really want to remove this room?'
      : 'Do you really want to recreate this room? It will delete all your non-persistent data.'

    const { value } = await swal({
      title: props.action === 'remove' ? 'Remove room' : 'Recreate room',
      text: warning,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'No',
    })

    if (!value) return
  }

  loading.value = true

  try {
    await store.dispatch(templateDef.value.dispatch, props.roomId)
    await swal({ title: templateDef.value.msg, icon: 'success' })
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
