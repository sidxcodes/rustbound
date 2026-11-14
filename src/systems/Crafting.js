import { RECIPES, ITEMS } from '../data/items.js';

export class Crafting {
  constructor(game) { this.game = game; }
  canCraft(recipe) {
    return Object.entries(recipe.needs).every(([id, qty]) => this.game.inventory.has(id, qty));
  }
  craft(recipeId) {
    const recipe = RECIPES.find((r) => r.id === recipeId), inv = this.game.inventory;
    if (!recipe || !this.canCraft(recipe)) return false;
    for (const [id, qty] of Object.entries(recipe.needs)) inv.remove(id, qty);
    if (!inv.add({ ...recipe.out })) {
      // no room: give the materials back
      for (const [id, qty] of Object.entries(recipe.needs)) inv.add({ id, qty });
      this.game.events.emit('toast', 'Too heavy to carry');
      return false;
    }
    this.game.events.emit('toast', `Crafted ${ITEMS[recipe.out.id].name.toLowerCase()}`);
    this.game.events.emit('sfx', 'craft');
    return true;
  }
}
