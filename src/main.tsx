import "./styles/index.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const container = document.querySelector<HTMLDivElement>("#app");
if (!container) {
  throw new Error("Missing #app container");
}

createRoot(container).render(<App />);
