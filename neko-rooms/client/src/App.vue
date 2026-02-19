<template>
  <v-app>
    <v-app-bar color="indigo" density="comfortable">
      <a class="text-white text-decoration-none" href="https://github.com/m1k1o/neko-rooms">neko-rooms</a>
      <v-spacer />
      <a class="text-white text-decoration-none" href="https://m1k1o.net">m1k1o</a>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <Home />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import Home from './views/Home.vue'
</script>
