import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/index.css";
import App from "@/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Hide the refresh preloader (see index.html) once the app has mounted and
// painted. A short delay keeps it from flashing away instantly on fast
// connections while still feeling snappy.
const preloader = document.getElementById("app-preloader");
if (preloader) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      preloader.classList.add("app-preloader--hidden");
      preloader.addEventListener(
        "transitionend",
        () => preloader.remove(),
        { once: true },
      );
    }, 300);
  });
}
