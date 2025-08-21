import { regenerateDedications, regenerateFeats } from "./regenerate.js";
import { registerSettings } from "./settings.js";

Hooks.once("init", () => {
    console.log("True Archetype | Initializing");
    registerSettings();

    CONFIG.PF2E.featCategories.truearchetype = "PF2E.TrueArchetype.TrueArchetype";
    CONFIG.PF2E.featCategories.truearchetypefeat = "PF2E.TrueArchetype.TrueArchetypeFeats";

    // Register the custom trait so validation & UI labeling work
    CONFIG.PF2E.featTraits.trueArchetype = "True Archetype";
    CONFIG.PF2E.traitsDescriptions.trueArchetype = "This feat is part of the True Archetype system and replaces the standard Archetype trait on modified dedications.";
});

Hooks.once("ready", async function () {
    console.log("True Archetype | Ready");
    const campaignFeatSections = game.settings.get("pf2e", "campaignFeatSections");
    //if (!campaignFeatSections.find((section) => section.id === "truearchetype")) {
        campaignFeatSections.push({
            id: "truearchetype",
            label: game.i18n.localize(`PF2E.TrueArchetype.TrueArchetype`),
            supported: ["truearchetype"],
            slots: [1]
        });
    //}
    //if (!campaignFeatSections.find((section) => section.id === "truearchetypefeats")) {
        campaignFeatSections.push({
            id: "truearchetypefeats",
            label: game.i18n.localize(`PF2E.TrueArchetype.TrueArchetypeFeats`),
            supported: ["truearchetypefeat"],
            slots: [2,4,6,8,10,12,14,16,18,20]
        });
    //}
    game.settings.set("pf2e", "campaignFeatSections", campaignFeatSections);

    // Helper to check and regenerate a pack if empty
    async function ensureCompendiumNotEmpty(packKey, regenerateFn) {
        const pack = game.packs.get(packKey);
        if (!pack) {
            console.warn(`True Archetype | Could not find compendium: ${packKey}`);
            return;
        }

        // Load index
        await pack.getIndex();
        if (pack.index.size > 0) {
            console.log(`True Archetype | ${packKey} already populated, skipping.`);
            return;
        }

        console.log(`True Archetype | ${packKey} is empty, regenerating...`);

        // Temporarily unlock
        const oldLocked = pack.locked;
        if (oldLocked) {
            await pack.configure({ locked: false });
        }

        try {
            await regenerateFn(false);
            console.log(`True Archetype | ${packKey} regenerated.`);
        } catch (err) {
            console.error(`True Archetype | Failed to regenerate ${packKey}:`, err);
        }

        // Relock
        if (oldLocked) {
            await pack.configure({ locked: true });
        }
    }

    await ensureCompendiumNotEmpty(
        "true-archetype.true-archetype-dedications",
        regenerateDedications
    );

    await ensureCompendiumNotEmpty(
        "true-archetype.true-archetype-feats",
        regenerateFeats
    );
});