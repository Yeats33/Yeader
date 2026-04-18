import "./styles.css";
import { initApp } from "./app.ts";
import { loadTheme, getCurrentTheme, getColorMode } from "./theme.ts";
import { renderNavBar, initNavBar } from "./components/NavBar.ts";

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

  // Render persistent bottom nav above the page container
  const navWrapper = document.createElement("div");
  navWrapper.id = "nav-wrapper";
  navWrapper.innerHTML = renderNavBar();
  document.body.appendChild(navWrapper);
  initNavBar(navWrapper as HTMLElement);

  await initApp(container);
}

void bootstrap();
