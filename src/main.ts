import "./styles.css";
import { initApp } from "./app.ts";

async function bootstrap() {
  const container = document.querySelector<HTMLDivElement>("#app");
  if (!container) {
    throw new Error("Missing #app container");
  }

  if (!window.location.hash) {
    window.location.hash = "/";
  }

  await initApp(container);
}

void bootstrap();
