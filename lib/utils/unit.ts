import { Ingredient } from '../../types';

export function toBaseUnit(containerQty: number, ingredient: Ingredient): number {
  if (!ingredient.container_size) return containerQty;
  return containerQty * ingredient.container_size;
}

export function toContainerUnit(baseQty: number, ingredient: Ingredient): number | null {
  if (!ingredient.container_size) return null;
  return baseQty / ingredient.container_size;
}

export function formatStock(baseQty: number, ingredient: Ingredient): string {
  if (!ingredient.container_size || !ingredient.container_unit) {
    return `${baseQty}${ingredient.unit}`;
  }
  const containerQty = baseQty / ingredient.container_size;
  const display = Number.isInteger(containerQty)
    ? String(containerQty)
    : containerQty.toFixed(2);
  return `${display}${ingredient.container_unit} (${baseQty}${ingredient.unit})`;
}

export function stockUnit(ingredient: Ingredient): string {
  return ingredient.container_unit ?? ingredient.unit;
}
