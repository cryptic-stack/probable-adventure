import type { SweetAlertOptions } from 'sweetalert2'
import Swal from 'sweetalert2/dist/sweetalert2.js'

type VueSweetalert2Options = SweetAlertOptions

const createSwal = (options?: VueSweetalert2Options) => (...args: [SweetAlertOptions]) =>
  options ? Swal.mixin(options).fire(...args) : Swal.fire(...args)

export default {
  install(app: any, options?: VueSweetalert2Options) {
    const swal = createSwal(options)
    app.config.globalProperties.$swal = swal
    app.config.globalProperties.swal = swal
  },
}
