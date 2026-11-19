// Genera el catálogo de ejemplo que no está hecho a mano: seed/tiendas/<tienda>.mas.csv y sus imágenes SVG.
//   node seed/generar-catalogo.mjs
// Los CSV usan el formato del importador de Vendure (precio en unidades mayores; variantes en filas siguientes).
import { mkdirSync, writeFileSync } from "node:fs";

const COLORS = {
  Rojo: "#c8102e",
  Azul: "#1e4fa1",
  Verde: "#2f6b3a",
  Negro: "#1f1d1a",
  Blanco: "#f4f1ec",
  Coral: "#f2735d",
  Natural: "#d8c3a0",
  Gris: "#8a8d91",
  Terracota: "#b5562f",
  Multicolor: "#e0a500",
};
const slug = (t) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** [nombre, descripción, categoría global, precio base, peso g, opciones { grupo: valores }, ajustes de precio por opción] */
const stores = {
  "tienda-demo": {
    brand: "sibu",
    hue: "#1d6b4f",
    products: [
      [
        "Blusa Coral",
        "Blusa liviana de algodón, manga corta.",
        "moda-mujer-blusas",
        16500,
        180,
        { Talla: ["S", "M", "L"] },
      ],
      [
        "Vestido Atardecer",
        "Vestido midi de lino con botones al frente.",
        "moda-mujer-vestidos",
        28000,
        300,
        { Talla: ["S", "M", "L"], Color: ["Azul", "Verde"] },
      ],
      [
        "Pantalón Lino",
        "Pantalón de lino con cintura elástica.",
        "moda-hombre-pantalones",
        24000,
        350,
        { Talla: ["M", "L", "XL"] },
      ],
      [
        "Camiseta Ola",
        "Camiseta con estampado de olas del Pacífico.",
        "moda-hombre-camisetas",
        12500,
        200,
        { Talla: ["S", "M", "L"], Color: ["Blanco", "Azul"] },
      ],
      ["Bolso de Yute", "Bolso de yute con forro de algodón.", "moda-accesorios", 18000, 400, {}],
      [
        "Pañuelo Tucán",
        "Pañuelo de seda estampado con tucanes.",
        "moda-accesorios",
        7500,
        50,
        { Color: ["Rojo", "Verde"] },
      ],
    ],
  },
  "cafe-sur": {
    brand: "cafe-sur",
    hue: "#6b4226",
    products: [
      [
        "Café de Naranjo",
        "Café de Naranjo, tueste oscuro. Notas de cacao.",
        "cafe-y-alimentos-cafe",
        11,
        380,
        { Tamaño: ["340 g", "1 kg"] },
        { "1 kg": 29 },
      ],
      ["Café Descafeinado", "Descafeinado al agua de Tarrazú.", "cafe-y-alimentos-cafe", 13, 380, {}],
      [
        "Cold Brew Concentrado",
        "Concentrado de café en frío: mezcle 1 a 3 con agua o leche.",
        "cafe-y-alimentos-cafe",
        9,
        550,
        { Capacidad: ["500 ml", "1 l"] },
        { "1 l": 15 },
      ],
      ["Chocolate con Sal", "Chocolate oscuro con sal de Guanacaste.", "cafe-y-alimentos-chocolate", 6.5, 100, {}],
      [
        "Chocolate Blanco con Café",
        "Chocolate blanco con granos de café molido.",
        "cafe-y-alimentos-chocolate",
        6.5,
        100,
        {},
      ],
      [
        "Cacao en Polvo",
        "Cacao puro sin azúcar de Talamanca.",
        "cafe-y-alimentos-chocolate",
        8,
        270,
        { Tamaño: ["250 g"] },
      ],
    ],
  },
  "barro-telar": {
    brand: "barro-y-telar",
    hue: "#b5562f",
    products: [
      [
        "Taza de Barro",
        "Taza de barro hecha a mano en Guaitil.",
        "artesania-ceramica",
        9500,
        350,
        { Color: ["Terracota", "Negro"] },
      ],
      ["Plato Hondo", "Plato hondo de cerámica esmaltada.", "artesania-ceramica", 12000, 600, {}],
      [
        "Jarrón Chorotega",
        "Jarrón con diseños chorotegas pintados a mano.",
        "artesania-ceramica",
        22000,
        900,
        { Tamaño: ["Pequeño", "Grande"] },
        { Grande: 38000 },
      ],
      [
        "Mantel Bordado",
        "Mantel de algodón bordado a mano.",
        "artesania-textiles",
        26000,
        700,
        { Tamaño: ["4 puestos", "6 puestos"] },
        { "6 puestos": 32000 },
      ],
      [
        "Hamaca",
        "Hamaca de algodón tejida en telar.",
        "artesania-textiles",
        45000,
        1800,
        { Color: ["Natural", "Multicolor"] },
      ],
      [
        "Bolso Tejido",
        "Bolso de mano tejido con fibras naturales.",
        "artesania-textiles",
        19000,
        300,
        { Color: ["Azul", "Rojo"] },
      ],
      [
        "Individuales",
        "Juego de 4 individuales tejidos.",
        "artesania-textiles",
        15000,
        400,
        { Color: ["Natural", "Gris"] },
      ],
      ["Máscara Boruca", "Máscara boruca tallada en balsa y pintada a mano.", "artesania", 55000, 800, {}],
      ["Velas de Cera de Abeja", "Juego de 3 velas de cera de abeja.", "artesania", 8500, 450, {}],
      ["Cucharas de Madera", "Juego de 3 cucharas de madera de guanacaste.", "artesania", 11000, 250, {}],
    ],
  },
  voltio: {
    brand: "voltio",
    hue: "#2c2c2c",
    products: [
      [
        "Audífonos Inalámbricos",
        "Audífonos bluetooth con cancelación de ruido.",
        "tecnologia-audio",
        59,
        250,
        { Color: ["Negro", "Blanco"] },
      ],
      [
        "Parlante Portátil",
        "Parlante resistente al agua, 12 horas de batería.",
        "tecnologia-audio",
        45,
        600,
        { Color: ["Negro", "Azul"] },
      ],
      ["Audífonos con Cable", "Audífonos con micrófono y conector de 3,5 mm.", "tecnologia-audio", 15, 80, {}],
      [
        "Funda de Silicona",
        "Funda de silicona suave al tacto.",
        "tecnologia-accesorios-para-celular",
        12,
        50,
        { Color: ["Negro", "Rojo", "Azul"] },
      ],
      ["Cargador USB-C 20 W", "Cargador rápido de pared USB-C.", "tecnologia-accesorios-para-celular", 18, 90, {}],
      [
        "Cable USB-C",
        "Cable USB-C trenzado.",
        "tecnologia-accesorios-para-celular",
        8,
        60,
        { Tamaño: ["1 m", "2 m"] },
        { "2 m": 11 },
      ],
      [
        "Batería Portátil",
        "Batería portátil con carga rápida.",
        "tecnologia-accesorios-para-celular",
        25,
        250,
        { Capacidad: ["10 000 mAh", "20 000 mAh"] },
        { "20 000 mAh": 39 },
      ],
      [
        "Soporte para Auto",
        "Soporte magnético para la rejilla del aire.",
        "tecnologia-accesorios-para-celular",
        14,
        120,
        {},
      ],
      ["Protector de Pantalla", "Vidrio templado 9H, juego de 2.", "tecnologia-accesorios-para-celular", 9, 40, {}],
      ["Lápiz Táctil", "Lápiz táctil universal con punta fina.", "tecnologia-accesorios-para-celular", 19, 30, {}],
    ],
  },
};

const svg = (title, fill) => {
  const text = fill === COLORS.Blanco || fill === COLORS.Natural ? "#1f1d1a" : "#ffffff";
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f2f0ec"/><rect x="130" y="110" width="340" height="340" rx="48" fill="${fill}"/><text x="300" y="320" font-family="sans-serif" font-size="110" font-weight="700" text-anchor="middle" fill="${text}">${initials}</text><text x="300" y="540" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#555">${title.toLowerCase()}</text></svg>`;
};

const cartesian = (groups) =>
  groups.reduce((acc, [, values]) => acc.flatMap((combo) => values.map((v) => [...combo, v])), [[]]);

mkdirSync(new URL("./assets/", import.meta.url), { recursive: true });
const header =
  "name,slug,description,assets,facets,optionGroups,optionValues,sku,price,taxCategory,stockOnHand,trackInventory,variantAssets,variantFacets,product:marketplaceCategory,product:brand,variant:weightGrams";

for (const [store, { brand, hue, products }] of Object.entries(stores)) {
  const rows = [header];
  for (const [name, description, category, price, weight, options, prices = {}] of products) {
    const productSlug = slug(name);
    const groups = Object.entries(options);
    const colorGroup = groups.find(([g]) => g === "Color");
    const images = colorGroup
      ? colorGroup[1].map((c) => [c, `${productSlug}-${slug(c)}.svg`])
      : [[null, `${productSlug}.svg`]];
    for (const [color, file] of images) {
      writeFileSync(
        new URL(`./assets/${file}`, import.meta.url),
        svg(color ? `${name} ${color}` : name, COLORS[color] ?? hue),
      );
    }
    const combos = cartesian(groups);
    combos.forEach((combo, i) => {
      const color = colorGroup ? combo[groups.indexOf(colorGroup)] : null;
      const variantImage = images.find(([c]) => c === color)?.[1] ?? images[0][1];
      const sku = [productSlug.slice(0, 12), ...combo.map((v) => slug(v))].join("-").toUpperCase();
      const variantPrice = combo.map((v) => prices[v]).find((p) => p !== undefined) ?? price;
      const stock = i === combos.length - 1 && combos.length > 2 ? 0 : 12; // una variante agotada en los productos grandes
      const product = i === 0;
      rows.push(
        [
          product ? name : "",
          product ? productSlug : "",
          product ? `"<p>${description}</p>"` : "",
          product ? images.map(([, f]) => f).join("|") : "",
          "",
          product ? groups.map(([g]) => g).join("|") : "",
          combo.join("|"),
          sku,
          String(variantPrice),
          "IVA",
          String(stock),
          "true",
          variantImage,
          "",
          product ? category : "",
          product ? brand : "",
          String(weight),
        ].join(","),
      );
    });
  }
  writeFileSync(new URL(`./tiendas/${store}.mas.csv`, import.meta.url), rows.join("\n") + "\n");
  console.log(`${store}: ${products.length} productos`);
}
