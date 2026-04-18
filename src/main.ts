import "./styles.css";
import { initApp } from "./app.ts";
import { loadTheme, getCurrentTheme, getColorMode } from "./theme.ts";

async function bootstrap() {
  const container = document.querySelector<HTMLDivElement>("#app");
  if (!container) {
    throw new Error("Missing #app container");
  }

  if (!window.location.hash) {
    window.location.hash = "/";
  }

  // Load theme system
  try {
    await loadTheme(getCurrentTheme(), getColorMode());
  } catch (e) {
    console.warn("Theme load failed, using defaults:", e);
  }

  await initApp(container);
}

void bootstrap();
