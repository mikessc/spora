// Entrada del navegador: solo las islas. El resto de la página es HTML del servidor y no se toca.
import { mountIslands, registerIsland } from "sibujs";
import { islandComponent } from "sibujs/ssr";
import { AddToCart } from "./islands/add-to-cart";
import { Gallery } from "./islands/gallery";
import { VariantSelector } from "./islands/variant-selector";

registerIsland("gallery", islandComponent(Gallery));
registerIsland("variants", islandComponent(VariantSelector));
registerIsland("add-to-cart", islandComponent(AddToCart));
mountIslands();
