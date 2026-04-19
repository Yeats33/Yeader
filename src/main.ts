import "./styles.css";
import { initApp } from "./app.ts";
import { loadTheme, getCurrentTheme, getColorMode } from "./theme.ts";
import { renderNavBar, initNavBar } from "./components/NavBar.ts";
import { listen } from "@tauri-apps/api/event";
import { importEpub } from "./api.ts";

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

  // Hide nav on webui page
  const hideNavRoutes = ["/integration/so-novel/webui"];
  function updateNavVisibility() {
    const hash = window.location.hash.replace(/^#/, "") || "/";
    navWrapper.style.display = hideNavRoutes.some((r) => hash.startsWith(r)) ? "none" : "";
  }
  window.addEventListener("hashchange", updateNavVisibility);
  updateNavVisibility();

  // Listen for so-novel download events
  listen<string>("so-novel-download-ready", async (event) => {
    const path = event.payload;
    console.log("so-novel downloaded:", path);
    try {
      const book = await importEpub(path);
      console.log("Imported to bookshelf:", book.name);
    } catch (e) {
      console.error("Failed to import so-novel download:", e);
    }
  });

  await initApp(container);
}

void bootstrap();
