export async function regenerateDedications() {
    const packName = "temporary-true-archetype-dedications";
    const label = "Temporary True Archetype Dedications";

    // Try to locate an existing compendium
    let pack = game.packs.get(`world.${packName}`);

    if (!pack) {
        pack = await CompendiumCollection.createCompendium({
            entity: "Item",
            label,
            name: packName,
            package: "world",
            type: "Item"
        });
    } else {
        // Empty existing pack
        const content = await pack.getDocuments();
        for (let doc of content) {
            await doc.delete();
        }
    }

    // Find the official PF2e Feats pack
    const featsPack = game.packs.get("pf2e.feats-srd");
    if (!featsPack) {
        ui.notifications.error("Could not find PF2E Feats compendium (pf2e.feats-srd)");
        return;
    }

    const index = await featsPack.getIndex({ fields: ["system.traits.value"] });

    const dedicationFeats = index.filter(e =>
        e.system?.traits?.value?.includes("dedication") &&
        e.system?.traits?.value?.includes("multiclass")
    );

    const dedicationMap = {}; // { originalDedicationId: newTrueArchetypeId }

    for (const entry of dedicationFeats) {
        const feat = await featsPack.getDocument(entry._id);
        const imported = await pack.importDocument(feat);

        const src = imported.toObject();
        const m = src.name.match(/^(.*)\s+Dedication$/i);
        const baseClass = (m?.[1] ?? src.name).trim();

        src.name = `True Archetype: ${baseClass}`;
        const slug = baseClass.toLowerCase().replace(/[^\w]+/g, "-").replace(/(^-|-$)/g, "");
        src.system.slug = `true-archetype-${slug}`;
        src.system.category = "truearchetype";
        src.system.level.value = 1;
        src.system.prerequisites.value = [];

        const traits = new Set(src.system.traits.value ?? []);
        traits.delete("dedication");
        traits.delete("archetype");
        traits.add("trueArchetype");
        traits.add("multiclass");
        src.system.traits.value = Array.from(traits);

        src.system.rules ??= [];
        src.system.rules.push({
            key: "RollOption",
            domain: "true-archetype",
            option: slug
        });

        await imported.update(src);

        // Save mapping
        dedicationMap[entry._id] = imported.id;
    }

    await game.settings.set("true-archetype", "devDedicationMap", dedicationMap);

    ui.notifications.info(`Imported and processed ${dedicationFeats.length} Multiclass Dedications into True Archetypes.`);
}

export async function overwriteDedications() {
    const sourcePack = game.packs.get("world.temporary-true-archetype-dedications");
    const targetPack = game.packs.get("true-archetype.true-archetype-dedications");

    // Delete everything currently in the target pack
    const existing = await targetPack.getDocuments();
    if (existing.length > 0) {
        await targetPack.documentClass.deleteDocuments(
            existing.map(d => d.id),
            { pack: targetPack.collection }
        );
    }

    // Import fresh docs from source
    const docs = await sourcePack.getDocuments();
    await targetPack.documentClass.createDocuments(
        docs.map(d => d.toObject()),
        { pack: targetPack.collection }
    );

    console.log(`True Archetype | Overwrote ${docs.length} documents in ${targetPack.collection}`);
}


export async function regenerateFeats() {
    const packName = "temporary-true-archetype-feats";
    const label = "Temporary True Archetype Feats";

    let pack = game.packs.get(`world.${packName}`);
    if (!pack) {
        pack = await CompendiumCollection.createCompendium({
            entity: "Item",
            label,
            name: packName,
            package: "world",
            type: "Item"
        });
    } else {
        const content = await pack.getDocuments();
        for (let doc of content) {
            await doc.delete();
        }
    }

    const featsPack = game.packs.get("pf2e.feats-srd");
    if (!featsPack) {
        ui.notifications.error("Could not find PF2E Feats compendium (pf2e.feats-srd)");
        return;
    }

    const dedicationMap = await game.settings.get("true-archetype", "devDedicationMap") ?? {};
    if (!dedicationMap || !Object.keys(dedicationMap).length) {
        ui.notifications.error("No dedication map found. Run regenerateDedications() first.");
        return;
    }

    // --- Step 1: Load all feats once ---
    const index = await featsPack.getIndex({ fields: ["system.prerequisites.value", "name", "system.slug"] });
    const idToEntry = new Map(index.map(f => [f._id, f]));

    // Preprocess: map featId -> prereq text[] (lowercased)
    const prereqMap = new Map();
    for (const entry of index) {
        const prereqs = entry.system?.prerequisites?.value ?? [];
        prereqMap.set(entry._id, prereqs.map(p => p.value.toLowerCase()));
    }

    // --- Step 2: Find dedication names (lowercased) ---
    const dedicationNames = Object.keys(dedicationMap).map(dedId => {
        const feat = idToEntry.get(dedId);
        return feat?.name?.toLowerCase();
    }).filter(Boolean);

    // --- Step 3: Seed feats that directly reference a dedication ---
    const featsToCopyIds = new Set();
    for (const [id, prereqs] of prereqMap.entries()) {
        if (dedicationNames.some(dedName => prereqs.some(p => p.includes(dedName)))) {
            featsToCopyIds.add(id);
        }
    }

    // --- Step 4: Propagate one and two hops ---
    const allIds = Array.from(prereqMap.keys());
    let added = true;
    let hopCount = 0;
    while (added && hopCount < 2) {   // do 2 hops
        added = false;
        for (const id of allIds) {
            if (featsToCopyIds.has(id)) continue;
            const prereqs = prereqMap.get(id) ?? [];
            // check if this feat requires something already marked
            const matches = Array.from(featsToCopyIds).some(fid => {
                const prereqFeat = idToEntry.get(fid);
                return prereqFeat && prereqs.some(p => p.includes(prereqFeat.name.toLowerCase()));
            });
            if (matches) {
                featsToCopyIds.add(id);
                added = true;
            }
        }
        hopCount++;
    }

    console.log(`True Archetype | Identified ${featsToCopyIds.size} feats to import`);

    // --- Step 5: Import only selected feats ---
    const featMap = new Map();
    const entryMap = new Map();
    for (const id of featsToCopyIds) {
        const featDoc = await featsPack.getDocument(id);
        const baseName = featDoc.name;
        const trueName = `True ${baseName}`;
        featMap.set(baseName.toLowerCase(), trueName);
        entryMap.set(baseName, featDoc);
    }

    for (const id of featsToCopyIds) {
        const feat = await featsPack.getDocument(id);
        const imported = await pack.importDocument(feat);
        const src = imported.toObject();

        makeTrueArchetypeRules(src, entryMap);

        // Rewrite prerequisites: replace original dedication names with "True Archetype: X"
        src.system.prerequisites.value = src.system.prerequisites.value.map(p => {
            const originalMatch = Object.keys(dedicationMap).find(dedId => {
                const dedFeat = idToEntry.get(dedId);
                return dedFeat && p.value.toLowerCase().includes(dedFeat.name.toLowerCase());
            });
            if (originalMatch) {
                const dedFeat = idToEntry.get(originalMatch);
                const baseClass = dedFeat.name.replace(/\s+Dedication$/, "");
                return { value: `True Archetype: ${baseClass}` };
            }
            const lower = p.value.toLowerCase();
            for (const [origName, trueName] of featMap.entries()) {
                if (lower.includes(origName)) {
                    return { value: trueName };
                }
            }
            return p;
        });

        src.name = `True ${imported.name}`;
        src.system.slug = `true-${imported.system.slug}`;
        src.system.category = "truearchetypefeat";
        src.system.level.value = 2 * Math.ceil(imported.system.level.value / 4);

        const traits = new Set(src.system.traits.value ?? []);
        traits.delete("archetype");
        traits.add("trueArchetype");
        src.system.traits.value = Array.from(traits);

        await imported.update(src);
    }

    ui.notifications.info(`Imported and processed ${featsToCopyIds.size} Archetype Feats into ${label}.`);
}

export async function overwriteFeats() {
    const sourcePack = game.packs.get("world.temporary-true-archetype-feats");
    const targetPack = game.packs.get("true-archetype.true-archetype-feats");
    
    // Delete everything currently in the target pack
    const existing = await targetPack.getDocuments();
    if (existing.length > 0) {
        await targetPack.documentClass.deleteDocuments(
            existing.map(d => d.id),
            { pack: targetPack.collection }
        );
    }

    // Import fresh docs from source
    const docs = await sourcePack.getDocuments();
    await targetPack.documentClass.createDocuments(
        docs.map(d => d.toObject()),
        { pack: targetPack.collection }
    );

    console.log(`True Archetype | Overwrote ${docs.length} documents in ${targetPack.collection}`);
}

function makeTrueArchetypeRules(src, entryMap) {
    const prereqs = src.system.prerequisites?.value ?? [];
    if (!prereqs.length) return;

    // Look for a prerequisite feat we cloned earlier
    for (const prereq of prereqs) {
        const prereqEntry = entryMap.get(prereq.value ?? "");
        if (!prereqEntry) continue;

        // Check if the prereq has the "LevelOneOrTwoClassFeat" ChoiceSet
        const prereqChoice = (prereqEntry.system.rules ?? []).find(
            r => r.key === "ChoiceSet" && r.prompt === "PF2E.SpecificRule.Prompt.LevelOneOrTwoClassFeat"
        );
        const prereqGrant = (prereqEntry.system.rules ?? []).find(
            r => r.key === "GrantItem" && r.uuid === `{item|flags.pf2e.rulesSelections.${prereqChoice?.flag ?? ""}}`
        );

        // Keep everything else
        const otherRules = (prereqEntry.system.rules ?? []).filter(r => r !== prereqChoice && r !== prereqGrant);

        if (prereqChoice && prereqGrant) {
            const newChoice = foundry.utils.deepClone(prereqChoice);

            newChoice.prompt = `${src.name}: Select a class feat`;

            // Find an existing filter that compares item:level
            const idx = newChoice.choices.filter.findIndex((exp) => {
                if (typeof exp === "string") return false;

                const compare = exp.lte ?? exp.gte ?? [];
                return compare.includes("item:level");
            });

            if (idx >= 0) {
                // Mutate the element in place
                newChoice.choices.filter[idx] = {
                    lte: ["item:level", "self:level"],
                };
            } else {
                // Add a new filter
                newChoice.choices.filter.push({
                    lte: ["item:level", "self:level"],
                });
            }

            const newGrant = foundry.utils.deepClone(prereqGrant);

            src.system.rules = [newChoice, newGrant, ...otherRules];

            // Update description wording
            const replacements = new Map([
                [/\bhalf of your level\b/gi, "your level"],
                [/\bhalf your level\b/gi, "your level"],
                [/\bhalf of your character level\b/gi, "your character level"],
                [/\bhalf your character level\b/gi, "your character level"]
            ]);

            let desc = src.system.description.value ?? "";

            for (const [pattern, replacement] of replacements.entries()) {
                desc = desc.replace(pattern, replacement);
            }

            src.system.description.value = desc;

            return;
        }
    }
}
