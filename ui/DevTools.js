import { overwriteDedications, overwriteFeats, regenerateDedications, regenerateFeats } from "../scripts/regenerate.js";

export class DevTools extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "dev-tools",
            title: "True Archetype Dev Tools",
            template: "modules/true-archetype/templates/dev-tools.hbs",
            width: 400,
            closeOnSubmit: false,
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find("#regenerate-dedications").on("click", async () => {
            await regenerateDedications(true);
        });

        html.find("#overwrite-dedications").on("click", async () => {
            await overwriteDedications();
        });

        html.find("#regenerate-feats").on("click", async () => {
            await regenerateFeats(true);
        });

        html.find("#overwrite-feats").on("click", async () => {
            await overwriteFeats();
        });
    }
}
