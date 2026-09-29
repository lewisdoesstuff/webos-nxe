import { createVaporApp } from "@vue/runtime-vapor";

import Harness from "./Harness.vue";

import "../styles/main.css";

createVaporApp(Harness).mount("#app");
