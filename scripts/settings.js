import { DevTools } from "../ui/DevTools.js";

export function registerSettings() {
    game.settings.register("true-archetype", "isEnabled", {
        name: "Enable Rule",
        hint: "Is this custom rule enabled?",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });

    game.settings.register("true-archetype", "devDedicationMap", {
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    game.settings.registerMenu("true-archetype", "devTools", {
        name: "Dev Tools",
        label: "Open Developer Tools",
        hint: "Configure True Archetypee developer settings.",
        icon: "fas fa-wrench",
        type: DevTools,
        restricted: true
    });
}

export function getIsEnabled() {
    const isEnabled = game.settings.get("true-archetype", "isEnabled");
    return isEnabled;
}
