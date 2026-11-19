// Entrada del navegador: solo las islas. El resto de la página es HTML del servidor y no se toca.
import { mountIslands, registerIsland } from "sibujs";
import { islandComponent } from "sibujs/ssr";
import { enhancements, islands } from "./islands";

for (const [name, component] of Object.entries(islands)) {
  registerIsland(name, islandComponent(component as (props: unknown) => Node));
}
for (const [name, setup] of Object.entries(enhancements)) registerIsland(name, setup);
mountIslands();
