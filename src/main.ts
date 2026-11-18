import "./ui/style.css";
import { resetStuck } from "./queue/queue";
import { startRouter } from "./ui/router";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  // Önceki oturumda yarıda kalan okumalar kaybolmasın: `processing` → `pending`.
  void resetStuck()
    .catch(() => 0)
    .finally(() => startRouter(app));
}
