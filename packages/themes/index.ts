// Estilos de diseño disponibles (ADR 0005). Agregar un estilo = un archivo en estilos/ y su nombre aquí.
export const designStyles = ["suave", "minimal"] as const;
export type DesignStyle = (typeof designStyles)[number];

export const isDesignStyle = (value: unknown): value is DesignStyle => designStyles.includes(value as DesignStyle);
