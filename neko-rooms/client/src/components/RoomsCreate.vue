<template>
  <v-card>
    <v-card-title><span class="headline">Create new Room</span></v-card-title>
    <v-card-text>
      <v-form ref="form" v-model="valid">
        <v-row>
          <v-col>
            <v-text-field
              label="Name"
              v-model="data.name"
              :rules="[rules.minLen(2), rules.containerNameStart, rules.containerName]"
              autocomplete="off"
              :hint="!data.name ? '... using random name' : ''"
              persistent-hint
            />
          </v-col>
          <v-col>
            <v-select label="Neko image" :items="nekoImages" v-model="data.neko_image" />
          </v-col>
        </v-row>

        <v-row>
          <v-col>
            <v-text-field
              label="User password"
              v-model="data.user_pass"
              :append-inner-icon="showUserPass ? 'mdi-eye' : 'mdi-eye-off'"
              :type="showUserPass ? 'text' : 'password'"
              @click:append-inner="showUserPass = !showUserPass"
              autocomplete="off"
              :hint="!data.user_pass ? '... using random password' : ''"
              persistent-hint
            />
          </v-col>
          <v-col>
            <v-text-field
              label="Admin password"
              v-model="data.admin_pass"
              :append-inner-icon="showAdminPass ? 'mdi-eye' : 'mdi-eye-off'"
              :type="showAdminPass ? 'text' : 'password'"
              @click:append-inner="showAdminPass = !showAdminPass"
              autocomplete="off"
              :hint="!data.admin_pass ? '... using random password' : ''"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-row v-if="usesMux">
          <v-col>
            <v-checkbox v-model="data.control_protection" label="Enable control protection" hide-details class="mt-0" />
          </v-col>
          <v-col>
            <v-checkbox v-model="data.implicit_control" label="Enable implicit control" hide-details class="mt-0" />
          </v-col>
        </v-row>

        <v-row v-else>
          <v-col>
            <v-text-field
              label="Max connections"
              type="number"
              :rules="[rules.required, rules.nonZero, rules.onlyPositive]"
              v-model="data.max_connections"
            />
          </v-col>
          <v-col>
            <v-checkbox v-model="data.control_protection" label="Enable control protection" hide-details class="mt-0" />
            <v-checkbox v-model="data.implicit_control" label="Enable implicit control" hide-details class="mt-0" />
          </v-col>
        </v-row>

        <v-row>
          <v-col>
            <v-select label="Initial screen configuration" :items="availableScreens" v-model="data.screen" />
          </v-col>
          <v-col>
            <v-text-field label="Video codec" :items="videoCodecs" v-model="data.video_codec" />
          </v-col>
        </v-row>
      </v-form>
    </v-card-text>

    <v-card-actions>
      <v-spacer />
      <v-btn color="grey" variant="text" @click="close">Close</v-btn>
      <v-btn color="blue" @click="create(false)" :loading="loading && !loadingWithStart">Create</v-btn>
      <v-btn color="green" @click="createAndStart" :loading="loadingWithStart">Create and start</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import type { AxiosError } from 'axios'
import { randomPassword } from '@/utils/random'
import type { RoomSettings } from '@/api/index'
import type { State } from '@/store/state'

const emit = defineEmits<{ (event: 'finished', value: boolean): void }>()

const store = useStore<State>()
const vm = getCurrentInstance()

const form = ref<any>(null)
const valid = ref(true)
const loading = ref(false)
const loadingWithStart = ref(false)
const showUserPass = ref(false)
const showAdminPass = ref(false)

const data = ref<RoomSettings>({ ...store.state.defaultRoomSettings })

const rules = {
  required: (val: unknown) => (val === null || typeof val === 'undefined' || val === '' ? 'This field is mandatory.' : true),
  minLen: (min: number) => (val: string) => (val ? val.length >= min || `This field must have at least ${min} characters` : true),
  onlyPositive: (val: number) => (val < 0 ? 'Value cannot be negative.' : true),
  nonZero: (val: string) => (val === '0' ? 'Value cannot be zero.' : true),
  containerName: (val: string) => (val && !/^[a-zA-Z0-9_.-]+$/.test(val) ? 'Must only contain a-z A-Z 0-9 _ . -' : true),
  containerNameStart: (val: string) => (val && /^[_.-]/.test(val) ? 'Cannot start with _ . -' : true),
}

const nekoImages = computed<string[]>(() => store.state.roomsConfig.neko_images || [])
const usesMux = computed<boolean>(() => Boolean(store.state.roomsConfig.uses_mux))
const videoCodecs = computed<string[]>(() => store.state.videoCodecs)
const availableScreens = computed<string[]>(() => store.state.availableScreens)

const swal = (opts: Record<string, unknown>) => vm?.proxy?.$swal?.(opts)

const clear = () => {
  form.value?.resetValidation?.()
  data.value = {
    ...store.state.defaultRoomSettings,
    neko_image: nekoImages.value[0] || '',
  }
}

const create = async (start = false) => {
  const formValid = form.value?.validate?.()
  if (formValid && formValid.valid === false) return

  loading.value = true

  try {
    await store.dispatch(start ? 'ROOMS_CREATE_AND_START' : 'ROOMS_CREATE', {
      ...data.value,
      user_pass: data.value.user_pass || randomPassword(),
      admin_pass: data.value.admin_pass || randomPassword(),
      max_connections: Number(data.value.max_connections),
      control_protection: Boolean(data.value.control_protection),
      video_bitrate: Number(data.value.video_bitrate),
      video_max_fps: Number(data.value.video_max_fps),
      audio_bitrate: Number(data.value.audio_bitrate),
    })
    clear()
    emit('finished', true)
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

const createAndStart = async () => {
  loadingWithStart.value = true
  try {
    await create(true)
  } finally {
    loadingWithStart.value = false
  }
}

const close = () => {
  clear()
  emit('finished', true)
}

onMounted(clear)
</script>
