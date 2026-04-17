import "./styles.css";
import { createAppApi } from "./api.ts";
import { renderAppShell } from "./render.ts";

async function bootstrap() {
  const container = document.querySelector<HTMLDivElement>("#app");
  if (!container) {
    throw new Error("Missing #app container");
  }

  const snapshot = await createAppApi().getAppShellSnapshot();
  container.innerHTML = renderAppShell(snapshot);
}

void bootstrap();
