import {d20Roll, damageRoll} from "../dice/dice.mjs";
import simplifyRollFormula from "../dice/simplify-roll-formula.mjs";
import Advancement from "./advancement/advancement.mjs";
import AbilityUseDialog from "../applications/item/ability-use-dialog.mjs";
import Proficiency from "./actor/proficiency.mjs";

/**
 * Override and extend the basic Item implementation.
 */
export default class Item5e extends Item {

  /**
   * Caches an item linked to this one, such as a subclass associated with a class.
   * @type {Item5e}
   * @private
   */
  _classLink;

  /* -------------------------------------------- */
  /*  Item Properties                             */
  /* -------------------------------------------- */

  /**
   * Which ability score modifier is used by this item?
   * @type {string|null}
   */
  get abilityMod() {

    // Case 1 - defined directly by the item
    if ( this.system.ability ) return this.system.ability;

    // Case 2 - inferred from a parent actor
    if ( this.actor && ("abilities" in this.actor.system) ) {
      const abilities = this.actor.system.abilities;
      const spellcasting = this.actor.system.attributes.spellcasting;

      // Special rules per item type
      switch ( this.type ) {
        case "consumable":
          if ( this.system.consumableType === "scroll" ) return spellcasting || "int";
          break;
        case "spell":
          return spellcasting || "int";
        case "tool":
          return "int";
        case "weapon":
          // Finesse weapons - Str or Dex (PHB pg. 147)
          if ( this.system.properties.fin === true ) {
            return abilities.dex.mod >= abilities.str.mod ? "dex" : "str";
          }
          // Ranged weapons - Dex (PH p.194)
          if ( ["simpleR", "martialR"].includes(this.system.weaponType) ) return "dex";
          break;
      }

      // If a specific attack type is defined
      if ( this.hasAttack ) return {
        mwak: "str",
        rwak: "dex",
        msak: spellcasting || "int",
        rsak: spellcasting || "int"
      }[this.system.actionType];
    }

    // Case 3 - unknown
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Return an item's identifier.
   * @type {string}
   */
  get identifier() {
    return this.system.identifier || this.name.slugify({strict: true});
  }

  /* -------------------------------------------- */

  /**
   * Does this item support advancement and have advancements defined?
   * @type {boolean}
   */
  get hasAdvancement() {
    return !!this.system.advancement?.length;
  }

  /* -------------------------------------------- */

  /**
   * Does the Item implement an attack roll as part of its usage?
   * @type {boolean}
   */
  get hasAttack() {
    return ["mwak", "rwak", "msak", "rsak"].includes(this.system.actionType);
  }

  /* -------------------------------------------- */

  /**
   * Does the Item implement a damage roll as part of its usage?
   * @type {boolean}
   */
  get hasDamage() {
    return !!(this.system.damage && this.system.damage.parts.length);
  }

  /* -------------------------------------------- */

  /**
   * Does the Item implement a versatile damage roll as part of its usage?
   * @type {boolean}
   */
  get isVersatile() {
    return !!(this.hasDamage && this.system.damage.versatile);
  }

  /* -------------------------------------------- */

  /**
   * Does the item provide an amount of healing instead of conventional damage?
   * @type {boolean}
   */
  get isHealing() {
    return (this.system.actionType === "heal") && this.system.damage.parts.length;
  }

  /* -------------------------------------------- */

  /**
   * Is this class item the original class for the containing actor? If the item is not a class or it is not
   * embedded in an actor then this will return `null`.
   * @type {boolean|null}
   */
  get isOriginalClass() {
    if ( this.type !== "class" || !this.isEmbedded ) return null;
    return this.id === this.parent.system.details.originalClass;
  }

  /* -------------------------------------------- */

  /**
   * Class associated with this subclass. Always returns null on non-subclass or non-embedded items.
   * @type {Item5e|null}
   */
  get class() {
    if ( !this.isEmbedded || (this.type !== "subclass") ) return null;
    const cid = this.system.classIdentifier;
    return this._classLink ??= this.parent.items.find(i => (i.type === "class") && (i.identifier === cid));
  }

  /* -------------------------------------------- */

  /**
   * Subclass associated with this class. Always returns null on non-class or non-embedded items.
   * @type {Item5e|null}
   */
  get subclass() {
    if ( !this.isEmbedded || (this.type !== "class") ) return null;
    const items = this.parent.items;
    const cid = this.identifier;
    return this._classLink ??= items.find(i => (i.type === "subclass") && (i.system.classIdentifier === cid));
  }

  /* -------------------------------------------- */

  /**
   * Does the Item implement a saving throw as part of its usage?
   * @type {boolean}
   */
  get hasSave() {
    const save = this.system.save || {};
    return !!(save.ability && save.scaling);
  }

  /* --------------------------------------------- */

  /**
   * Does the Item implement an ability check as part of its usage?
   * @type {boolean}
   */
  get hasAbilityCheck() {
    return (this.system.actionType === "abil") && this.system.ability;
  }

  /* -------------------------------------------- */

  /**
   * Does the Item have a target?
   * @type {boolean}
   */
  get hasTarget() {
    const target = this.system.target;
    return target && !["none", ""].includes(target.type);
  }

  /* -------------------------------------------- */

  /**
   * Does the Item have an area of effect target?
   * @type {boolean}
   */
  get hasAreaTarget() {
    const target = this.system.target;
    return target && (target.type in CONFIG.DND5E.areaTargetTypes);
  }

  /* -------------------------------------------- */

  /**
   * Is this Item limited in its ability to be used by charges or by recharge?
   * @type {boolean}
   */
  get hasLimitedUses() {
    let recharge = this.system.recharge || {};
    let uses = this.system.uses || {};
    return !!recharge.value || (uses.per && (uses.max > 0));
  }

  /* -------------------------------------------- */

  /**
   * Is this item any of the armor subtypes?
   * @type {boolean}
   */
  get isArmor() {
    return this.system.armor?.type in CONFIG.DND5E.armorTypes;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve scale values for current level from advancement data.
   * @type {object}
   */
  get scaleValues() {
    if ( !["class", "subclass"].includes(this.type) || !this.advancement.byType.ScaleValue ) return {};
    const level = this.type === "class" ? this.system.levels : this.class?.system.levels ?? 0;
    return this.advancement.byType.ScaleValue.reduce((obj, advancement) => {
      obj[advancement.identifier] = advancement.valueForLevel(level);
      return obj;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Spellcasting details for a class or subclass.
   *
   * @typedef {object} SpellcastingDescription
   * @property {string} type              Spellcasting type as defined in ``CONFIG.DND5E.spellcastingTypes`.
   * @property {string|null} progression  Progression within the specified spellcasting type if supported.
   * @property {string} ability           Ability used when casting spells from this class or subclass.
   * @property {number|null} levels       Number of levels of this class or subclass's class if embedded.
   */

  /**
   * Retrieve the spellcasting for a class or subclass. For classes, this will return the spellcasting
   * of the subclass if it overrides the class. For subclasses, this will return the class's spellcasting
   * if no spellcasting is defined on the subclass.
   * @type {SpellcastingDescription|null}  Spellcasting object containing progression & ability.
   */
  get spellcasting() {
    const spellcasting = this.system.spellcasting;
    if ( !spellcasting ) return null;
    const isSubclass = this.type === "subclass";
    const classSC = isSubclass ? this.class?.system.spellcasting : spellcasting;
    const subclassSC = isSubclass ? spellcasting : this.subclass?.system.spellcasting;
    const finalSC = foundry.utils.deepClone(
      ( subclassSC && (subclassSC.progression !== "none") ) ? subclassSC : classSC
    );
    if ( !finalSC ) return null;
    finalSC.levels = this.isEmbedded ? (this.system.levels ?? this.class?.system.levels) : null;

    // Temp method for determining spellcasting type until this data is available directly using advancement
    if ( CONFIG.DND5E.spellcastingTypes[finalSC.progression] ) finalSC.type = finalSC.progression;
    else finalSC.type = Object.entries(CONFIG.DND5E.spellcastingTypes).find(([type, data]) => {
      return !!data.progression?.[finalSC.progression];
    })?.[0];

    return finalSC;
  }

  /* -------------------------------------------- */

  /**
   * Should this item's active effects be suppressed.
   * @type {boolean}
   */
  get areEffectsSuppressed() {
    const requireEquipped = (this.type !== "consumable")
      || ["rod", "trinket", "wand"].includes(this.system.consumableType);
    if ( requireEquipped && (this.system.equipped === false) ) return true;
    return this.system.attunement === CONFIG.DND5E.attunementTypes.REQUIRED;
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    //console.log(this);
    this.labels = {};

    // Clear out linked item cache
    this._classLink = undefined;

    // Advancement
    this._prepareAdvancement();

    // Specialized preparation per Item type
    switch ( this.type ) {
      case "equipment":
        this._prepareEquipment(); break;
      case "feat":
        this._prepareFeat(); break;
      case "spell":
        this._prepareSpell(); break;
    }

    // Activated Items
    this._prepareActivation();
    this._prepareAction();

    // Un-owned items can have their final preparation done here, otherwise this needs to happen in the owning Actor
    if ( !this.isOwned ) this.prepareFinalAttributes();
  }

  /* -------------------------------------------- */

  /**
   * Prepare derived data for an equipment-type item and define labels.
   * @protected
   */
  _prepareEquipment() {
    this.labels.armor = this.system.armor.value ? `${this.system.armor.value} ${game.i18n.localize("DND5E.AC")}` : "";
  }

  /* -------------------------------------------- */

  /**
   * Prepare derived data for a feat-type item and define labels.
   * @protected
   */
  _prepareFeat() {
    const act = this.system.activation;
    const types = CONFIG.DND5E.abilityActivationTypes;
    if ( act?.type === types.legendary ) this.labels.featType = game.i18n.localize("DND5E.LegendaryActionLabel");
    else if ( act?.type === types.lair ) this.labels.featType = game.i18n.localize("DND5E.LairActionLabel");
    else if ( act?.type ) {
      this.labels.featType = game.i18n.localize(this.system.damage.length ? "DND5E.Attack" : "DND5E.Action");
    }
    else this.labels.featType = game.i18n.localize("DND5E.Passive");
  }

  /* -------------------------------------------- */

  /**
   * Prepare derived data for a spell-type item and define labels.
   * @protected
   */
  _prepareSpell() {
    const tags = Object.fromEntries(Object.entries(CONFIG.DND5E.spellTags).map(([k, v]) => {
      v.tag = true;
      return [k, v];
    }));
    const attributes = {...CONFIG.DND5E.spellComponents, ...tags};
    this.system.preparation.mode ||= "prepared";
    this.labels.level = CONFIG.DND5E.spellLevels[this.system.level];
    this.labels.school = CONFIG.DND5E.spellSchools[this.system.school];
    this.labels.spellLists = {};
    // list each spell list
   if(this.name === "Acid Splash")
      console.log(this.system);
    if(this.system.spellLists?.wiz ?? false){
      console.log("runs");
    }
    this.labels.components = Object.entries(this.system.components).reduce((obj, [c, active]) => {
      const config = attributes[c];
      if ( !config || (active !== true) ) return obj;
      obj.all.push({abbr: config.abbr, tag: config.tag});
      if ( config.tag ) obj.tags.push(config.label);
      else obj.vsm.push(config.abbr);
      return obj;
    }, {all: [], vsm: [], tags: []});
    this.labels.components.vsm = new Intl.ListFormat(game.i18n.lang, { style: "narrow", type: "conjunction" })
      .format(this.labels.components.vsm);
    this.labels.materials = this.system?.materials?.value ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Prepare derived data for activated items and define labels.
   * @protected
   */
  _prepareActivation() {
    if ( !("activation" in this.system) ) return;
    const C = CONFIG.DND5E;

    // Ability Activation Label
    const act = this.system.activation ?? {};
    if ( ["none", ""].includes(act.type) ) act.type = null;   // Backwards compatibility
    this.labels.activation = act.type ? [act.cost, C.abilityActivationTypes[act.type]].filterJoin(" ") : "";

    // Target Label
    let tgt = this.system.target ?? {};
    if ( ["none", ""].includes(tgt.type) ) tgt.type = null;   // Backwards compatibility
    if ( [null, "self"].includes(tgt.type) ) tgt.value = tgt.units = null;
    else if ( tgt.units === "touch" ) tgt.value = null;
    this.labels.target = tgt.type
      ? [tgt.value, C.distanceUnits[tgt.units], C.targetTypes[tgt.type]].filterJoin(" ") : "";

    // Range Label
    let rng = this.system.range ?? {};
    if ( ["none", ""].includes(rng.units) ) rng.units = null; // Backwards compatibility
    if ( [null, "touch", "self"].includes(rng.units) ) rng.value = rng.long = null;
    this.labels.range = rng.units
      ? [rng.value, rng.long ? `/ ${rng.long}` : null, C.distanceUnits[rng.units]].filterJoin(" ") : "";

    // Recharge Label
    let chg = this.system.recharge ?? {};
    const chgSuffix = `${chg.value}${parseInt(chg.value) < 6 ? "+" : ""}`;
    this.labels.recharge = `${game.i18n.localize("DND5E.Recharge")} [${chgSuffix}]`;
  }

  /* -------------------------------------------- */

  /**
   * Prepare derived data and labels for items which have an action which deals damage.
   * @protected
   */
  _prepareAction() {
    if ( !("actionType" in this.system) ) return;
    let dmg = this.system.damage || {};
    if ( dmg.parts ) {
      const types = CONFIG.DND5E.damageTypes;
      this.labels.damage = dmg.parts.map(d => d[0]).join(" + ").replace(/\+ -/g, "- ");
      this.labels.damageTypes = dmg.parts.map(d => types[d[1]]).join(", ");
    }
  }

  /* -------------------------------------------- */

  /**
   * Prepare advancement objects from stored advancement data.
   * @protected
   */
  _prepareAdvancement() {
    const minAdvancementLevel = ["class", "subclass"].includes(this.type) ? 1 : 0;
    this.advancement = {
      byId: {},
      byLevel: Object.fromEntries(
        Array.fromRange(CONFIG.DND5E.maxLevel + 1).slice(minAdvancementLevel).map(l => [l, []])
      ),
      byType: {},
      needingConfiguration: []
    };
    for ( const advancement of this.system.advancement ?? [] ) {
      if ( !(advancement instanceof Advancement) ) continue;
      this.advancement.byId[advancement.id] = advancement;
      this.advancement.byType[advancement.type] ??= [];
      this.advancement.byType[advancement.type].push(advancement);
      advancement.levels.forEach(l => this.advancement.byLevel[l].push(advancement));
      if ( !advancement.levels.length ) this.advancement.needingConfiguration.push(advancement);
    }
    Object.entries(this.advancement.byLevel).forEach(([lvl, data]) => data.sort((a, b) => {
      return a.sortingValueForLevel(lvl).localeCompare(b.sortingValueForLevel(lvl));
    }));
  }

  /* -------------------------------------------- */

  /**
   * Compute item attributes which might depend on prepared actor data. If this item is embedded this method will
   * be called after the actor's data is prepared.
   * Otherwise, it will be called at the end of `Item5e#prepareDerivedData`.
   */
  prepareFinalAttributes() {

    // Proficiency
    if ( this.actor?.system.attributes?.prof ) {
      const isProficient = (this.type === "spell") || this.system.proficient; // Always proficient in spell attacks.
      this.system.prof = new Proficiency(this.actor?.system.attributes.prof, isProficient);
    }

    // Class data
    if ( this.type === "class" ) this.system.isOriginalClass = this.isOriginalClass;

    // Action usage
    if ( "actionType" in this.system ) {
      this.labels.abilityCheck = game.i18n.format("DND5E.AbilityPromptTitle", {
        ability: CONFIG.DND5E.abilities[this.system.ability]
      });

      // Saving throws
      this.getSaveDC();

      // To Hit
      this.getAttackToHit();

      // Limited Uses
      this.prepareMaxUses();

      // Duration
      this.prepareDurationValue();

      // Damage Label
      this.getDerivedDamageLabel();
    }
  }

  /* -------------------------------------------- */

  /**
   * Populate a label with the compiled and simplified damage formula based on owned item
   * actor data. This is only used for display purposes and is not related to `Item5e#rollDamage`.
   * @returns {{damageType: string, formula: string, label: string}[]}
   */
  getDerivedDamageLabel() {
    if ( !this.hasDamage || !this.isOwned ) return [];
    const rollData = this.getRollData();
    const damageLabels = { ...CONFIG.DND5E.damageTypes, ...CONFIG.DND5E.healingTypes };
    const derivedDamage = this.system.damage?.parts?.map(damagePart => {
      let formula;
      try {
        const roll = new Roll(damagePart[0], rollData);
        formula = simplifyRollFormula(roll.formula, { preserveFlavor: true });
      }
      catch(err) {
        console.warn(`Unable to simplify formula for ${this.name}: ${err}`);
      }
      const damageType = damagePart[1];
      return { formula, damageType, label: `${formula} ${damageLabels[damageType] ?? ""}` };
    });
    return this.labels.derivedDamage = derivedDamage;
  }

  /* -------------------------------------------- */

  /**
   * Update the derived spell DC for an item that requires a saving throw.
   * @returns {number|null}
   */
  getSaveDC() {
    if ( !this.hasSave ) return null;
    const save = this.system.save;

    // Actor spell-DC based scaling
    if ( save.scaling === "spell" ) {
      save.dc = this.isOwned ? this.actor.system.attributes.spelldc : null;
    }

    // Ability-score based scaling
    else if ( save.scaling !== "flat" ) {
      save.dc = this.isOwned ? this.actor.system.abilities[save.scaling].dc : null;
    }

    // Update labels
    const abl = CONFIG.DND5E.abilities[save.ability] ?? "";
    this.labels.save = game.i18n.format("DND5E.SaveDC", {dc: save.dc || "", ability: abl});
    return save.dc;
  }

  /* -------------------------------------------- */

  /**
   * Update a label to the Item detailing its total to hit bonus from the following sources:
   * - item document's innate attack bonus
   * - item's actor's proficiency bonus if applicable
   * - item's actor's global bonuses to the given item type
   * - item's ammunition if applicable
   * @returns {{rollData: object, parts: string[]}|null}  Data used in the item's Attack roll.
   */
  getAttackToHit() {
    if ( !this.hasAttack ) return null;
    const rollData = this.getRollData();
    const parts = [];

    // Include the item's innate attack bonus as the initial value and label
    const ab = this.system.attackBonus;
    if ( ab ) {
      parts.push(ab);
      this.labels.toHit = !/^[+-]/.test(ab) ? `+ ${ab}` : ab;
    }

    // Take no further action for un-owned items
    if ( !this.isOwned ) return {rollData, parts};

    // Ability score modifier
    parts.push("@mod");

    // Add proficiency bonus if an explicit proficiency flag is present or for non-item features
    if ( !["weapon", "consumable"].includes(this.type) || this.system.proficient ) {
      parts.push("@prof");
      if ( this.system.prof?.hasProficiency ) rollData.prof = this.system.prof.term;
    }

    // Actor-level global bonus to attack rolls
    const actorBonus = this.actor.system.bonuses?.[this.system.actionType] || {};
    if ( actorBonus.attack ) parts.push(actorBonus.attack);

    // One-time bonus provided by consumed ammunition
    if ( (this.system.consume?.type === "ammo") && this.actor.items ) {
      const ammoItem = this.actor.items.get(this.system.consume.target);
      if ( ammoItem ) {
        const ammoItemQuantity = ammoItem.system.quantity;
        const ammoCanBeConsumed = ammoItemQuantity && (ammoItemQuantity - (this.system.consume.amount ?? 0) >= 0);
        const ammoItemAttackBonus = ammoItem.system.attackBonus;
        const ammoIsTypeConsumable = (ammoItem.type === "consumable") && (ammoItem.system.consumableType === "ammo");
        if ( ammoCanBeConsumed && ammoItemAttackBonus && ammoIsTypeConsumable ) {
          parts.push("@ammo");
          rollData.ammo = ammoItemAttackBonus;
        }
      }
    }

    // Condense the resulting attack bonus formula into a simplified label
    const roll = new Roll(parts.join("+"), rollData);
    const formula = simplifyRollFormula(roll.formula) || "0";
    this.labels.toHit = !/^[+-]/.test(formula) ? `+ ${formula}` : formula;
    return {rollData, parts};
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an item's critical hit threshold. Uses the smallest value from among the following sources:
   * - item document
   * - item document's actor (if it has one)
   * - item document's ammunition (if it has any)
   * - the constant '20'
   * @returns {number|null}  The minimum value that must be rolled to be considered a critical hit.
   */
  getCriticalThreshold() {
    const actorFlags = this.actor.flags.dnd5e || {};
    if ( !this.hasAttack ) return null;
    let actorThreshold = null;
    let itemThreshold = this.system.critical?.threshold ?? Infinity;
    let ammoThreshold = Infinity;
    if ( this.type === "weapon" ) actorThreshold = actorFlags.weaponCriticalThreshold;
    else if ( this.type === "spell" ) actorThreshold = actorFlags.spellCriticalThreshold;
    if ( this.system.consume?.type === "ammo" ) {
      ammoThreshold = this.actor.items.get(this.system.consume.target)?.system.critical.threshold ?? Infinity;
    }
    return Math.min(itemThreshold, ammoThreshold, actorThreshold ?? 20);
  }

  /* -------------------------------------------- */

  /**
   * Populates the max uses of an item.
   * If the item is an owned item and the `max` is not numeric, calculate based on actor data.
   */
  prepareMaxUses() {
    const uses = this.system.uses;
    if ( !uses?.max ) return;
    let max = uses.max;
    if ( this.isOwned && !Number.isNumeric(max) ) {
      const property = game.i18n.localize("DND5E.UsesMax");
      try {
        const rollData = this.getRollData({ deterministic: true });
        max = Roll.safeEval(this.replaceFormulaData(max, rollData, { property }));
      } catch(e) {
        const message = game.i18n.format("DND5E.FormulaMalformedError", { property, name: this.name });
        this.actor._preparationWarnings.push({ message, link: this.uuid, type: "error" });
        console.error(message, e);
        return;
      }
    }
    uses.max = Number(max);
  }

  /* -------------------------------------------- */

  /**
   * Populate the duration value of an item. If the item is an owned item and the
   * duration value is not numeric, calculate based on actor data.
   */
  prepareDurationValue() {
    const duration = this.system.duration;
    if ( !duration?.value ) return;
    let value = duration.value;

    // If this is an owned item and the value is not numeric, we need to calculate it
    if ( this.isOwned && !Number.isNumeric(value) ) {
      const property = game.i18n.localize("DND5E.Duration");
      try {
        const rollData = this.getRollData({ deterministic: true });
        value = Roll.safeEval(this.replaceFormulaData(value, rollData, { property }));
      } catch(e) {
        const message = game.i18n.format("DND5E.FormulaMalformedError", { property, name: this.name });
        this.actor._preparationWarnings.push({ message, link: this.uuid, type: "error" });
        console.error(message, e);
        return;
      }
    }
    duration.value = Number(value);

    // Now that duration value is a number, set the label
    if ( ["inst", "perm"].includes(duration.units) ) duration.value = null;
    this.labels.duration = [duration.value, CONFIG.DND5E.timePeriods[duration.units]].filterJoin(" ");
  }

  /* -------------------------------------------- */

  /**
   * Replace referenced data attributes in the roll formula with values from the provided data.
   * If the attribute is not found in the provided data, display a warning on the actor.
   * @param {string} formula           The original formula within which to replace.
   * @param {object} data              The data object which provides replacements.
   * @param {object} options
   * @param {string} options.property  Name of the property to which this formula belongs.
   * @returns {string}                 Formula with replaced data.
   */
  replaceFormulaData(formula, data, { property }) {
    const dataRgx = new RegExp(/@([a-z.0-9_-]+)/gi);
    const missingReferences = new Set();
    formula = formula.replace(dataRgx, (match, term) => {
      let value = foundry.utils.getProperty(data, term);
      if ( value == null ) {
        missingReferences.add(match);
        return "0";
      }
      return String(value).trim();
    });
    if ( (missingReferences.size > 0) && this.actor ) {
      const listFormatter = new Intl.ListFormat(game.i18n.lang, { style: "long", type: "conjunction" });
      const message = game.i18n.format("DND5E.FormulaMissingReferenceWarn", {
        property, name: this.name, references: listFormatter.format(missingReferences)
      });
      this.actor._preparationWarnings.push({ message, link: this.uuid, type: "warning" });
    }
    return formula;
  }

  /* -------------------------------------------- */

  /**
   * Configuration data for an item usage being prepared.
   *
   * @typedef {object} ItemUseConfiguration
   * @property {boolean} createMeasuredTemplate  Trigger a template creation
   * @property {boolean} consumeQuantity         Should the item's quantity be consumed?
   * @property {boolean} consumeRecharge         Should a recharge be consumed?
   * @property {boolean} consumeResource         Should a linked (non-ammo) resource be consumed?
   * @property {number|string|null} consumeSpellLevel  Specific spell level to consume, or "pact" for pact level.
   * @property {boolean} consumeSpellSlot        Should any spell slot be consumed?
   * @property {boolean} consumeUsage            Should limited uses be consumed?
   * @property {boolean} needsConfiguration      Is user-configuration needed?
   */

  /**
   * Additional options used for configuring item usage.
   *
   * @typedef {object} ItemUseOptions
   * @property {boolean} configureDialog  Display a configuration dialog for the item usage, if applicable?
   * @property {string} rollMode          The roll display mode with which to display (or not) the card.
   * @property {boolean} createMessage    Whether to automatically create a chat message (if true) or simply return
   *                                      the prepared chat message data (if false).
   * @property {object} flags             Additional flags added to the chat message.
   * @property {Event} event              The browser event which triggered the item usage, if any.
   */

  /**
   * Trigger an item usage, optionally creating a chat message with followup actions.
   * @param {ItemUseOptions} [options]           Options used for configuring item usage.
   * @returns {Promise<ChatMessage|object|void>} Chat message if options.createMessage is true, message data if it is
   *                                             false, and nothing if the roll wasn't performed.
   * @deprecated since 2.0 in favor of `Item5e#use`, targeted for removal in 2.4
   */
  async roll(options={}) {
    foundry.utils.logCompatibilityWarning(
      "Item5e#roll has been renamed Item5e#use. Support for the old name will be removed in future versions.",
      { since: "DnD5e 2.0", until: "DnD5e 2.4" }
    );
    return this.use(undefined, options);
  }

  /**
   * Trigger an item usage, optionally creating a chat message with followup actions.
   * @param {ItemUseConfiguration} [config]      Initial configuration data for the usage.
   * @param {ItemUseOptions} [options]           Options used for configuring item usage.
   * @returns {Promise<ChatMessage|object|void>} Chat message if options.createMessage is true, message data if it is
   *                                             false, and nothing if the roll wasn't performed.
   */
  async use(config={}, options={}) {
    let item = this;
    const is = item.system;
    const as = item.actor.system;

    // Ensure the options object is ready
    options = foundry.utils.mergeObject({
      configureDialog: true,
      createMessage: true,
      "flags.dnd5e.use": {type: this.type, itemId: this.id, itemUuid: this.uuid}
    }, options);

    // Reference aspects of the item data necessary for usage
    const resource = is.consume || {};        // Resource consumption
    const isSpell = item.type === "spell";    // Does the item require a spell slot?
    const requireSpellSlot = isSpell && (is.level > 0) && CONFIG.DND5E.spellUpcastModes.includes(is.preparation.mode);

    // Define follow-up actions resulting from the item usage
    config = foundry.utils.mergeObject({
      createMeasuredTemplate: item.hasAreaTarget,
      consumeQuantity: is.uses?.autoDestroy ?? false,
      consumeRecharge: !!is.recharge?.value,
      consumeResource: !!resource.target && (!item.hasAttack || (resource.type !== "ammo")),
      consumeSpellLevel: requireSpellSlot ? is.preparation.mode === "pact" ? "pact" : is.level : null,
      consumeSpellSlot: requireSpellSlot,
      consumeUsage: !!is.uses?.per && (is.uses?.max > 0)
    }, config);

    // Display a configuration dialog to customize the usage
    if ( config.needsConfiguration === undefined ) config.needsConfiguration = config.createMeasuredTemplate
      || config.consumeRecharge || config.consumeResource || config.consumeSpellSlot || config.consumeUsage;

    /**
     * A hook event that fires before an item usage is configured.
     * @function dnd5e.preUseItem
     * @memberof hookEvents
     * @param {Item5e} item                  Item being used.
     * @param {ItemUseConfiguration} config  Configuration data for the item usage being prepared.
     * @param {ItemUseOptions} options       Additional options used for configuring item usage.
     * @returns {boolean}                    Explicitly return `false` to prevent item from being used.
     */
    if ( Hooks.call("dnd5e.preUseItem", item, config, options) === false ) return;

    // Display configuration dialog
    if ( (options.configureDialog !== false) && config.needsConfiguration ) {
      const configuration = await AbilityUseDialog.create(item);
      if ( !configuration ) return;
      foundry.utils.mergeObject(config, configuration);
    }

    // Handle spell upcasting
    if ( isSpell && (config.consumeSpellSlot || config.consumeSpellLevel) ) {
      const upcastLevel = config.consumeSpellLevel === "pact" ? as.spells.pact.level
        : parseInt(config.consumeSpellLevel);
      if ( upcastLevel && (upcastLevel !== is.level) ) {
        item = item.clone({"system.level": upcastLevel}, {keepId: true});
        item.prepareData();
        item.prepareFinalAttributes();
      }
    }
    if ( isSpell ) foundry.utils.mergeObject(options.flags, {"dnd5e.use.spellLevel": item.system.level});

    /**
     * A hook event that fires before an item's resource consumption has been calculated.
     * @function dnd5e.preItemUsageConsumption
     * @memberof hookEvents
     * @param {Item5e} item                  Item being used.
     * @param {ItemUseConfiguration} config  Configuration data for the item usage being prepared.
     * @param {ItemUseOptions} options       Additional options used for configuring item usage.
     * @returns {boolean}                    Explicitly return `false` to prevent item from being used.
     */
    if ( Hooks.call("dnd5e.preItemUsageConsumption", item, config, options) === false ) return;

    // Determine whether the item can be used by testing for resource consumption
    const usage = item._getUsageUpdates(config);
    if ( !usage ) return;

    /**
     * A hook event that fires after an item's resource consumption has been calculated but before any
     * changes have been made.
     * @function dnd5e.itemUsageConsumption
     * @memberof hookEvents
     * @param {Item5e} item                     Item being used.
     * @param {ItemUseConfiguration} config     Configuration data for the item usage being prepared.
     * @param {ItemUseOptions} options          Additional options used for configuring item usage.
     * @param {object} usage
     * @param {object} usage.actorUpdates       Updates that will be applied to the actor.
     * @param {object} usage.itemUpdates        Updates that will be applied to the item being used.
     * @param {object[]} usage.resourceUpdates  Updates that will be applied to other items on the actor.
     * @returns {boolean}                       Explicitly return `false` to prevent item from being used.
     */
    if ( Hooks.call("dnd5e.itemUsageConsumption", item, config, options, usage) === false ) return;

    // Commit pending data updates
    const { actorUpdates, itemUpdates, resourceUpdates } = usage;
    if ( !foundry.utils.isEmpty(itemUpdates) ) await item.update(itemUpdates);
    if ( config.consumeQuantity && (item.system.quantity === 0) ) await item.delete();
    if ( !foundry.utils.isEmpty(actorUpdates) ) await this.actor.update(actorUpdates);
    if ( resourceUpdates.length ) await this.actor.updateEmbeddedDocuments("Item", resourceUpdates);

    // Prepare card data & display it if options.createMessage is true
    const cardData = await item.displayCard(options);

    // Initiate measured template creation
    let templates;
    if ( config.createMeasuredTemplate ) {
      try {
        templates = await (dnd5e.canvas.AbilityTemplate.fromItem(item))?.drawPreview();
      } catch(err) {}
    }

    /**
     * A hook event that fires when an item is used, after the measured template has been created if one is needed.
     * @function dnd5e.useItem
     * @memberof hookEvents
     * @param {Item5e} item                                Item being used.
     * @param {ItemUseConfiguration} config                Configuration data for the roll.
     * @param {ItemUseOptions} options                     Additional options for configuring item usage.
     * @param {MeasuredTemplateDocument[]|null} templates  The measured templates if they were created.
     */
    Hooks.callAll("dnd5e.useItem", item, config, options, templates ?? null);

    return cardData;
  }

  /* -------------------------------------------- */

  /**
   * Verify that the consumed resources used by an Item are available and prepare the updates that should
   * be performed. If required resources are not available, display an error and return false.
   * @param {ItemUseConfiguration} config  Configuration data for an item usage being prepared.
   * @returns {object|boolean}             A set of data changes to apply when the item is used, or false.
   * @protected
   */
  _getUsageUpdates({
    consumeQuantity, consumeRecharge, consumeResource, consumeSpellSlot,
    consumeSpellLevel, consumeUsage}) {
    const actorUpdates = {};
    const itemUpdates = {};
    const resourceUpdates = [];

    // Consume Recharge
    if ( consumeRecharge ) {
      const recharge = this.system.recharge || {};
      if ( recharge.charged === false ) {
        ui.notifications.warn(game.i18n.format("DND5E.ItemNoUses", {name: this.name}));
        return false;
      }
      itemUpdates["system.recharge.charged"] = false;
    }

    // Consume Limited Resource
    if ( consumeResource ) {
      const canConsume = this._handleConsumeResource(itemUpdates, actorUpdates, resourceUpdates);
      if ( canConsume === false ) return false;
    }

    // Consume Spell Slots
    if ( consumeSpellSlot && consumeSpellLevel ) {
      if ( Number.isNumeric(consumeSpellLevel) ) consumeSpellLevel = `spell${consumeSpellLevel}`;
      const level = this.actor?.system.spells[consumeSpellLevel];
      const spells = Number(level?.value ?? 0);
      if ( spells === 0 ) {
        const labelKey = consumeSpellLevel === "pact" ? "DND5E.SpellProgPact" : `DND5E.SpellLevel${this.system.level}`;
        const label = game.i18n.localize(labelKey);
        ui.notifications.warn(game.i18n.format("DND5E.SpellCastNoSlots", {name: this.name, level: label}));
        return false;
      }
      actorUpdates[`system.spells.${consumeSpellLevel}.value`] = Math.max(spells - 1, 0);
    }

    // Consume Limited Usage
    if ( consumeUsage ) {
      const uses = this.system.uses || {};
      const available = Number(uses.value ?? 0);
      let used = false;
      const remaining = Math.max(available - 1, 0);
      if ( available >= 1 ) {
        used = true;
        itemUpdates["system.uses.value"] = remaining;
      }

      // Reduce quantity if not reducing usages or if usages hit zero, and we are set to consumeQuantity
      if ( consumeQuantity && (!used || (remaining === 0)) ) {
        const q = Number(this.system.quantity ?? 1);
        if ( q >= 1 ) {
          used = true;
          itemUpdates["system.quantity"] = Math.max(q - 1, 0);
          itemUpdates["system.uses.value"] = uses.max ?? 1;
        }
      }

      // If the item was not used, return a warning
      if ( !used ) {
        ui.notifications.warn(game.i18n.format("DND5E.ItemNoUses", {name: this.name}));
        return false;
      }
    }

    // Return the configured usage
    return {itemUpdates, actorUpdates, resourceUpdates};
  }

  /* -------------------------------------------- */

  /**
   * Handle update actions required when consuming an external resource
   * @param {object} itemUpdates        An object of data updates applied to this item
   * @param {object} actorUpdates       An object of data updates applied to the item owner (Actor)
   * @param {object[]} resourceUpdates  An array of updates to apply to other items owned by the actor
   * @returns {boolean|void}            Return false to block further progress, or return nothing to continue
   * @protected
   */
  _handleConsumeResource(itemUpdates, actorUpdates, resourceUpdates) {
    const consume = this.system.consume || {};
    if ( !consume.type ) return;

    // No consumed target
    const typeLabel = CONFIG.DND5E.abilityConsumptionTypes[consume.type];
    if ( !consume.target ) {
      ui.notifications.warn(game.i18n.format("DND5E.ConsumeWarningNoResource", {name: this.name, type: typeLabel}));
      return false;
    }

    // Identify the consumed resource and its current quantity
    let resource = null;
    let amount = Number(consume.amount ?? 1);
    let quantity = 0;
    switch ( consume.type ) {
      case "attribute":
        resource = foundry.utils.getProperty(this.actor.system, consume.target);
        quantity = resource || 0;
        break;
      case "ammo":
      case "material":
        resource = this.actor.items.get(consume.target);
        quantity = resource ? resource.system.quantity : 0;
        break;
      case "hitDice":
        const denom = !["smallest", "largest"].includes(consume.target) ? consume.target : false;
        resource = Object.values(this.actor.classes).filter(cls => !denom || (cls.system.hitDice === denom));
        quantity = resource.reduce((count, cls) => count + cls.system.levels - cls.system.hitDiceUsed, 0);
        break;
      case "charges":
        resource = this.actor.items.get(consume.target);
        if ( !resource ) break;
        const uses = resource.system.uses;
        if ( uses.per && uses.max ) quantity = uses.value;
        else if ( resource.system.recharge?.value ) {
          quantity = resource.system.recharge.charged ? 1 : 0;
          amount = 1;
        }
        break;
    }

    // Verify that a consumed resource is available
    if ( resource === undefined ) {
      ui.notifications.warn(game.i18n.format("DND5E.ConsumeWarningNoSource", {name: this.name, type: typeLabel}));
      return false;
    }

    // Verify that the required quantity is available
    let remaining = quantity - amount;
    if ( remaining < 0 ) {
      ui.notifications.warn(game.i18n.format("DND5E.ConsumeWarningNoQuantity", {name: this.name, type: typeLabel}));
      return false;
    }

    // Define updates to provided data objects
    switch ( consume.type ) {
      case "attribute":
        actorUpdates[`system.${consume.target}`] = remaining;
        break;
      case "ammo":
      case "material":
        resourceUpdates.push({_id: consume.target, "system.quantity": remaining});
        break;
      case "hitDice":
        if ( ["smallest", "largest"].includes(consume.target) ) resource = resource.sort((lhs, rhs) => {
          let sort = lhs.system.hitDice.localeCompare(rhs.system.hitDice, "en", {numeric: true});
          if ( consume.target === "largest" ) sort *= -1;
          return sort;
        });
        let toConsume = consume.amount;
        for ( const cls of resource ) {
          const available = (toConsume > 0 ? cls.system.levels : 0) - cls.system.hitDiceUsed;
          const delta = toConsume > 0 ? Math.min(toConsume, available) : Math.max(toConsume, available);
          if ( delta !== 0 ) {
            resourceUpdates.push({_id: cls.id, "system.hitDiceUsed": cls.system.hitDiceUsed + delta});
            toConsume -= delta;
            if ( toConsume === 0 ) break;
          }
        }
        break;
      case "charges":
        const uses = resource.system.uses || {};
        const recharge = resource.system.recharge || {};
        const update = {_id: consume.target};
        if ( uses.per && uses.max ) update["system.uses.value"] = remaining;
        else if ( recharge.value ) update["system.recharge.charged"] = false;
        resourceUpdates.push(update);
        break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Display the chat card for an Item as a Chat Message
   * @param {ItemUseOptions} [options]  Options which configure the display of the item chat card.
   * @returns {ChatMessage|object}      Chat message if `createMessage` is true, otherwise an object containing
   *                                    message data.
   */
  async displayCard(options={}) {

    // Render the chat card template
    const token = this.actor.token;
    const templateData = {
      actor: this.actor,
      tokenId: token?.uuid || null,
      item: this,
      data: await this.getChatData(),
      labels: this.labels,
      hasAttack: this.hasAttack,
      isHealing: this.isHealing,
      hasDamage: this.hasDamage,
      isVersatile: this.isVersatile,
      isSpell: this.type === "spell",
      hasSave: this.hasSave,
      hasAreaTarget: this.hasAreaTarget,
      isTool: this.type === "tool",
      hasAbilityCheck: this.hasAbilityCheck
    };
    const html = await renderTemplate("systems/dnd5e/templates/chat/item-card.hbs", templateData);

    // Create the ChatMessage data object
    const chatData = {
      user: game.user.id,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      content: html,
      flavor: this.system.chatFlavor || this.name,
      speaker: ChatMessage.getSpeaker({actor: this.actor, token}),
      flags: {"core.canPopout": true}
    };

    // If the Item was destroyed in the process of displaying its card - embed the item data in the chat message
    if ( (this.type === "consumable") && !this.actor.items.has(this.id) ) {
      chatData.flags["dnd5e.itemData"] = templateData.item.toObject();
    }

    // Merge in the flags from options
    chatData.flags = foundry.utils.mergeObject(chatData.flags, options.flags);

    /**
     * A hook event that fires before an item chat card is created.
     * @function dnd5e.preDisplayCard
     * @memberof hookEvents
     * @param {Item5e} item             Item for which the chat card is being displayed.
     * @param {object} chatData         Data used to create the chat message.
     * @param {ItemUseOptions} options  Options which configure the display of the item chat card.
     */
    Hooks.callAll("dnd5e.preDisplayCard", this, chatData, options);

    // Apply the roll mode to adjust message visibility
    ChatMessage.applyRollMode(chatData, options.rollMode ?? game.settings.get("core", "rollMode"));

    // Create the Chat Message or return its data
    const card = (options.createMessage !== false) ? await ChatMessage.create(chatData) : chatData;

    /**
     * A hook event that fires after an item chat card is created.
     * @function dnd5e.displayCard
     * @memberof hookEvents
     * @param {Item5e} item              Item for which the chat card is being displayed.
     * @param {ChatMessage|object} card  The created ChatMessage instance or ChatMessageData depending on whether
     *                                   options.createMessage was set to `true`.
     */
    Hooks.callAll("dnd5e.displayCard", this, card);

    return card;
  }

  /* -------------------------------------------- */
  /*  Chat Cards                                  */
  /* -------------------------------------------- */

  /**
   * Prepare an object of chat data used to display a card for the Item in the chat log.
   * @param {object} htmlOptions    Options used by the TextEditor.enrichHTML function.
   * @returns {object}              An object of chat data to render.
   */
  async getChatData(htmlOptions={}) {
    const data = this.toObject().system;
    const labels = this.labels;

    // Rich text description
    data.description.value = await TextEditor.enrichHTML(data.description.value, {
      async: true,
      relativeTo: this,
      rollData: this.getRollData(),
      ...htmlOptions
    });

    // Item type specific properties
    const props = [];
    switch ( this.type ) {
      case "consumable":
        this._consumableChatData(data, labels, props); break;
      case "equipment":
        this._equipmentChatData(data, labels, props); break;
      case "feat":
        this._featChatData(data, labels, props); break;
      case "loot":
        this._lootChatData(data, labels, props); break;
      case "spell":
        this._spellChatData(data, labels, props); break;
      case "tool":
        this._toolChatData(data, labels, props); break;
      case "weapon":
        this._weaponChatData(data, labels, props); break;
    }

    // Equipment properties
    if ( data.hasOwnProperty("equipped") && !["loot", "tool"].includes(this.type) ) {
      if ( data.attunement === CONFIG.DND5E.attunementTypes.REQUIRED ) {
        props.push(CONFIG.DND5E.attunements[CONFIG.DND5E.attunementTypes.REQUIRED]);
      }
      props.push(
        game.i18n.localize(data.equipped ? "DND5E.Equipped" : "DND5E.Unequipped"),
        game.i18n.localize(data.proficient ? "DND5E.Proficient" : "DND5E.NotProficient")
      );
    }

    // Ability activation properties
    if ( data.hasOwnProperty("activation") ) {
      props.push(
        labels.activation + (data.activation?.condition ? ` (${data.activation.condition})` : ""),
        labels.target,
        labels.range,
        labels.duration
      );
    }

    // Filter properties and return
    data.properties = props.filter(p => !!p);
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Prepare chat card data for consumable type items.
   * @param {object} data     Copy of item data being use to display the chat message.
   * @param {object} labels   Specially prepared item labels.
   * @param {string[]} props  Existing list of properties to be displayed. *Will be mutated.*
   * @private
   */
  _consumableChatData(data, labels, props) {
    props.push(
      CONFIG.DND5E.consumableTypes[data.consumableType],
      `${data.uses.value}/${data.uses.max} ${game.i18n.localize("DND5E.Charges")}`
    );
    data.hasCharges = data.uses.value >= 0;
  }

  /* -------------------------------------------- */

  /**
   * Prepare chat card data for equipment type items.
   * @param {object} data     Copy of item data being use to display the chat message.
   * @param {object} labels   Specially prepared item labels.
   * @param {string[]} props  Existing list of properties to be displayed. *Will be mutated.*
   * @private
   */
  _equipmentChatData(data, labels, props) {
    props.push(
      CONFIG.DND5E.equipmentTypes[data.armor.type],
      labels.armor || null,
      data.stealth ? game.i18n.localize("DND5E.StealthDisadvantage") : null
    );
  }

  /* -------------------------------------------- */

  /**
   * Prepare chat card data for items of the Feat type.
   * @param {object} data     Copy of item data being use to display the chat message.
   * @param {object} labels   Specially prepared item labels.
   * @param {string[]} props  Existing list of properties to be displayed. *Will be mutated.*
   * @private
   */
  _featChatData(data, labels, props) {
    props.push(data.requirements);
  }

  /* -------------------------------------------- */

  /**
   * Prepare chat card data for loot type items.
   * @param {object} data     Copy of item data being use to display the chat message.
   * @param {object} labels   Specially prepared item labels.
   * @param {string[]} props  Existing list of properties to be displayed. *Will be mutated.*
   * @private
   */
  _lootChatData(data, labels, props) {
    props.push(
      game.i18n.localize("ITEM.TypeLoot"),
      data.weight ? `${data.weight} ${game.i18n.localize("DND5E.AbbreviationLbs")}` : null
    );
  }

  /* -------------------------------------------- */

  /**
   * Render a chat card for Spell type data.
   * @param {object} data     Copy of item data being use to display the chat message.
   * @param {object} labels   Specially prepared item labels.
   * @param {string[]} props  Existing list of properties to be displayed. *Will be mutated.*
   * @private
   */
  _spellChatData(data, labels, props) {
    props.push(
      labels.level,
      labels.components.vsm + (labels.materials ? ` (${labels.materials})` : ""),
      ...labels.components.tags
    );
  }

  /* -------------------------------------------- */

  /**
   * Prepare chat card data for tool type items.
   * @param {object} data     Copy of item data being use to display the chat message.
   * @param {object} labels   Specially prepared item labels.
   * @param {string[]} props  Existing list of properties to be displayed. *Will be mutated.*
   * @private
   */
  _toolChatData(data, labels, props) {
    props.push(
      CONFIG.DND5E.abilities[data.ability] || null,
      CONFIG.DND5E.proficiencyLevels[data.proficient || 0]
    );
  }

  /* -------------------------------------------- */

  /**
   * Prepare chat card data for weapon type items.
   * @param {object} data     Copy of item data being use to display the chat message.
   * @param {object} labels   Specially prepared item labels.
   * @param {string[]} props  Existing list of properties to be displayed. *Will be mutated.*
   * @private
   */
  _weaponChatData(data, labels, props) {
    props.push(
      CONFIG.DND5E.weaponTypes[data.weaponType]
    );
  }

  /* -------------------------------------------- */
  /*  Item Rolls - Attack, Damage, Saves, Checks  */
  /* -------------------------------------------- */

  /**
   * Place an attack roll using an item (weapon, feat, spell, or equipment)
   * Rely upon the d20Roll logic for the core implementation
   *
   * @param {D20RollConfiguration} options  Roll options which are configured and provided to the d20Roll function
   * @returns {Promise<D20Roll|null>}       A Promise which resolves to the created Roll instance
   */
  async rollAttack(options={}) {
    const flags = this.actor.flags.dnd5e ?? {};
    if ( !this.hasAttack ) throw new Error("You may not place an Attack Roll with this Item.");
    let title = `${this.name} - ${game.i18n.localize("DND5E.AttackRoll")}`;

    // Get the parts and rollData for this item's attack
    const {parts, rollData} = this.getAttackToHit();
    if ( options.spellLevel ) rollData.item.level = options.spellLevel;

    // Handle ammunition consumption
    delete this._ammo;
    let ammo = null;
    let ammoUpdate = [];
    const consume = this.system.consume;
    if ( consume?.type === "ammo" ) {
      ammo = this.actor.items.get(consume.target);
      if ( ammo?.system ) {
        const q = ammo.system.quantity;
        const consumeAmount = consume.amount ?? 0;
        if ( q && (q - consumeAmount >= 0) ) {
          this._ammo = ammo;
          title += ` [${ammo.name}]`;
        }
      }

      // Get pending ammunition update
      const usage = this._getUsageUpdates({consumeResource: true});
      if ( usage === false ) return null;
      ammoUpdate = usage.resourceUpdates ?? [];
    }

    // Flags
    const elvenAccuracy = (flags.elvenAccuracy
      && CONFIG.DND5E.characterFlags.elvenAccuracy.abilities.includes(this.abilityMod)) || undefined;

    // Compose roll options
    const rollConfig = foundry.utils.mergeObject({
      actor: this.actor,
      data: rollData,
      critical: this.getCriticalThreshold(),
      title,
      flavor: title,
      elvenAccuracy,
      halflingLucky: flags.halflingLucky,
      dialogOptions: {
        width: 400,
        top: options.event ? options.event.clientY - 80 : null,
        left: window.innerWidth - 710
      },
      messageData: {
        "flags.dnd5e.roll": {type: "attack", itemId: this.id, itemUuid: this.uuid},
        speaker: ChatMessage.getSpeaker({actor: this.actor})
      }
    }, options);
    rollConfig.parts = parts.concat(options.parts ?? []);

    /**
     * A hook event that fires before an attack is rolled for an Item.
     * @function dnd5e.preRollAttack
     * @memberof hookEvents
     * @param {Item5e} item                  Item for which the roll is being performed.
     * @param {D20RollConfiguration} config  Configuration data for the pending roll.
     * @returns {boolean}                    Explicitly return false to prevent the roll from being performed.
     */
    if ( Hooks.call("dnd5e.preRollAttack", this, rollConfig) === false ) return;

    const roll = await d20Roll(rollConfig);
    if ( roll === null ) return null;

    /**
     * A hook event that fires after an attack has been rolled for an Item.
     * @function dnd5e.rollAttack
     * @memberof hookEvents
     * @param {Item5e} item          Item for which the roll was performed.
     * @param {D20Roll} roll         The resulting roll.
     * @param {object[]} ammoUpdate  Updates that will be applied to ammo Items as a result of this attack.
     */
    Hooks.callAll("dnd5e.rollAttack", this, roll, ammoUpdate);

    // Commit ammunition consumption on attack rolls resource consumption if the attack roll was made
    if ( ammoUpdate.length ) await this.actor?.updateEmbeddedDocuments("Item", ammoUpdate);
    return roll;
  }

  /* -------------------------------------------- */

  /**
   * Place a damage roll using an item (weapon, feat, spell, or equipment)
   * Rely upon the damageRoll logic for the core implementation.
   * @param {object} [config]
   * @param {MouseEvent} [config.event]    An event which triggered this roll, if any
   * @param {boolean} [config.critical]    Should damage be rolled as a critical hit?
   * @param {number} [config.spellLevel]   If the item is a spell, override the level for damage scaling
   * @param {boolean} [config.versatile]   If the item is a weapon, roll damage using the versatile formula
   * @param {DamageRollConfiguration} [config.options]  Additional options passed to the damageRoll function
   * @returns {Promise<DamageRoll>}        A Promise which resolves to the created Roll instance, or null if the action
   *                                       cannot be performed.
   */
  async rollDamage({critical, event=null, spellLevel=null, versatile=false, options={}}={}) {
    if ( !this.hasDamage ) throw new Error("You may not make a Damage Roll with this Item.");
    const messageData = {
      "flags.dnd5e.roll": {type: "damage", itemId: this.id, itemUuid: this.uuid},
      speaker: ChatMessage.getSpeaker({actor: this.actor})
    };

    // Get roll data
    const dmg = this.system.damage;
    const parts = dmg.parts.map(d => d[0]);
    const rollData = this.getRollData();
    if ( spellLevel ) rollData.item.level = spellLevel;

    // Configure the damage roll
    const actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "DND5E.Healing" : "DND5E.DamageRoll");
    const title = `${this.name} - ${actionFlavor}`;
    const rollConfig = {
      actor: this.actor,
      critical,
      data: rollData,
      event,
      title: title,
      flavor: this.labels.damageTypes.length ? `${title} (${this.labels.damageTypes})` : title,
      dialogOptions: {
        width: 400,
        top: event ? event.clientY - 80 : null,
        left: window.innerWidth - 710
      },
      messageData
    };

    // Adjust damage from versatile usage
    if ( versatile && dmg.versatile ) {
      parts[0] = dmg.versatile;
      messageData["flags.dnd5e.roll"].versatile = true;
    }

    // Scale damage from up-casting spells
    const scaling = this.system.scaling;
    if ( (this.type === "spell") ) {
      if ( scaling.mode === "cantrip" ) {
        let level;
        if ( this.actor.type === "character" ) level = this.actor.system.details.level;
        else if ( this.system.preparation.mode === "innate" ) level = Math.ceil(this.actor.system.details.cr);
        else level = this.actor.system.details.spellLevel;
        this._scaleCantripDamage(parts, scaling.formula, level, rollData);
      }
      else if ( spellLevel && (scaling.mode === "level") && scaling.formula ) {
        this._scaleSpellDamage(parts, this.system.level, spellLevel, scaling.formula, rollData);
      }
    }

    // Add damage bonus formula
    const actorBonus = foundry.utils.getProperty(this.actor.system, `bonuses.${this.system.actionType}`) || {};
    if ( actorBonus.damage && (parseInt(actorBonus.damage) !== 0) ) {
      parts.push(actorBonus.damage);
    }

    // Only add the ammunition damage if the ammunition is a consumable with type 'ammo'
    if ( this._ammo && (this._ammo.type === "consumable") && (this._ammo.system.consumableType === "ammo") ) {
      parts.push("@ammo");
      rollData.ammo = this._ammo.system.damage.parts.map(p => p[0]).join("+");
      rollConfig.flavor += ` [${this._ammo.name}]`;
      delete this._ammo;
    }

    // Factor in extra critical damage dice from the Barbarian's "Brutal Critical"
    if ( this.system.actionType === "mwak" ) {
      rollConfig.criticalBonusDice = this.actor.getFlag("dnd5e", "meleeCriticalDamageDice") ?? 0;
    }

    // Factor in extra weapon-specific critical damage
    if ( this.system.critical?.damage ) rollConfig.criticalBonusDamage = this.system.critical.damage;

    foundry.utils.mergeObject(rollConfig, options);
    rollConfig.parts = parts.concat(options.parts ?? []);

    /**
     * A hook event that fires before a damage is rolled for an Item.
     * @function dnd5e.preRollDamage
     * @memberof hookEvents
     * @param {Item5e} item                     Item for which the roll is being performed.
     * @param {DamageRollConfiguration} config  Configuration data for the pending roll.
     * @returns {boolean}                       Explicitly return false to prevent the roll from being performed.
     */
    if ( Hooks.call("dnd5e.preRollDamage", this, rollConfig) === false ) return;

    const roll = await damageRoll(rollConfig);

    /**
     * A hook event that fires after a damage has been rolled for an Item.
     * @function dnd5e.rollDamage
     * @memberof hookEvents
     * @param {Item5e} item      Item for which the roll was performed.
     * @param {DamageRoll} roll  The resulting roll.
     */
    if ( roll ) Hooks.callAll("dnd5e.rollDamage", this, roll);

    // Call the roll helper utility
    return roll;
  }

  /* -------------------------------------------- */

  /**
   * Adjust a cantrip damage formula to scale it for higher level characters and monsters.
   * @param {string[]} parts   The original parts of the damage formula.
   * @param {string} scale     The scaling formula.
   * @param {number} level     Level at which the spell is being cast.
   * @param {object} rollData  A data object that should be applied to the scaled damage roll.
   * @returns {string[]}       The parts of the damage formula with the scaling applied.
   * @private
   */
  _scaleCantripDamage(parts, scale, level, rollData) {
    const add = Math.floor((level + 1) / 6);
    if ( add === 0 ) return [];
    return this._scaleDamage(parts, scale || parts.join(" + "), add, rollData);
  }

  /* -------------------------------------------- */

  /**
   * Adjust the spell damage formula to scale it for spell level up-casting.
   * @param {string[]} parts      The original parts of the damage formula.
   * @param {number} baseLevel    Default level for the spell.
   * @param {number} spellLevel   Level at which the spell is being cast.
   * @param {string} formula      The scaling formula.
   * @param {object} rollData     A data object that should be applied to the scaled damage roll.
   * @returns {string[]}          The parts of the damage formula with the scaling applied.
   * @private
   */
  _scaleSpellDamage(parts, baseLevel, spellLevel, formula, rollData) {
    const upcastLevels = Math.max(spellLevel - baseLevel, 0);
    if ( upcastLevels === 0 ) return parts;
    return this._scaleDamage(parts, formula, upcastLevels, rollData);
  }

  /* -------------------------------------------- */

  /**
   * Scale an array of damage parts according to a provided scaling formula and scaling multiplier.
   * @param {string[]} parts    The original parts of the damage formula.
   * @param {string} scaling    The scaling formula.
   * @param {number} times      A number of times to apply the scaling formula.
   * @param {object} rollData   A data object that should be applied to the scaled damage roll
   * @returns {string[]}        The parts of the damage formula with the scaling applied.
   * @private
   */
  _scaleDamage(parts, scaling, times, rollData) {
    if ( times <= 0 ) return parts;
    const p0 = new Roll(parts[0], rollData);
    const s = new Roll(scaling, rollData).alter(times);

    // Attempt to simplify by combining like dice terms
    let simplified = false;
    if ( (s.terms[0] instanceof Die) && (s.terms.length === 1) ) {
      const d0 = p0.terms[0];
      const s0 = s.terms[0];
      if ( (d0 instanceof Die) && (d0.faces === s0.faces) && d0.modifiers.equals(s0.modifiers) ) {
        d0.number += s0.number;
        parts[0] = p0.formula;
        simplified = true;
      }
    }

    // Otherwise, add to the first part
    if ( !simplified ) parts[0] = `${parts[0]} + ${s.formula}`;
    return parts;
  }

  /* -------------------------------------------- */

  /**
   * Prepare data needed to roll an attack using an item (weapon, feat, spell, or equipment)
   * and then pass it off to `d20Roll`.
   * @param {object} [options]
   * @param {boolean} [options.spellLevel]  Level at which a spell is cast.
   * @returns {Promise<Roll>}   A Promise which resolves to the created Roll instance.
   */
  async rollFormula({spellLevel}={}) {
    if ( !this.system.formula ) throw new Error("This Item does not have a formula to roll!");

    const rollConfig = {
      formula: this.system.formula,
      data: this.getRollData(),
      chatMessage: true
    };
    if ( spellLevel ) rollConfig.data.item.level = spellLevel;

    /**
     * A hook event that fires before a formula is rolled for an Item.
     * @function dnd5e.preRollFormula
     * @memberof hookEvents
     * @param {Item5e} item                 Item for which the roll is being performed.
     * @param {object} config               Configuration data for the pending roll.
     * @param {string} config.formula       Formula that will be rolled.
     * @param {object} config.data          Data used when evaluating the roll.
     * @param {boolean} config.chatMessage  Should a chat message be created for this roll?
     * @returns {boolean}                   Explicitly return false to prevent the roll from being performed.
     */
    if ( Hooks.call("dnd5e.preRollFormula", this, rollConfig) === false ) return;

    const roll = await new Roll(rollConfig.formula, rollConfig.data).roll({async: true});

    if ( rollConfig.chatMessage ) {
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({actor: this.actor}),
        flavor: `${this.name} - ${game.i18n.localize("DND5E.OtherFormula")}`,
        rollMode: game.settings.get("core", "rollMode"),
        messageData: {"flags.dnd5e.roll": {type: "other", itemId: this.id, itemUuid: this.uuid}}
      });
    }

    /**
     * A hook event that fires after a formula has been rolled for an Item.
     * @function dnd5e.rollFormula
     * @memberof hookEvents
     * @param {Item5e} item  Item for which the roll was performed.
     * @param {Roll} roll    The resulting roll.
     */
    Hooks.callAll("dnd5e.rollFormula", this, roll);

    return roll;
  }

  /* -------------------------------------------- */

  /**
   * Perform an ability recharge test for an item which uses the d6 recharge mechanic.
   * @returns {Promise<Roll>}   A Promise which resolves to the created Roll instance
   */
  async rollRecharge() {
    const recharge = this.system.recharge ?? {};
    if ( !recharge.value ) return;

    const rollConfig = {
      formula: "1d6",
      data: this.getRollData(),
      target: parseInt(recharge.value),
      chatMessage: true
    };

    /**
     * A hook event that fires before the Item is rolled to recharge.
     * @function dnd5e.preRollRecharge
     * @memberof hookEvents
     * @param {Item5e} item                 Item for which the roll is being performed.
     * @param {object} config               Configuration data for the pending roll.
     * @param {string} config.formula       Formula that will be used to roll the recharge.
     * @param {object} config.data          Data used when evaluating the roll.
     * @param {number} config.target        Total required to be considered recharged.
     * @param {boolean} config.chatMessage  Should a chat message be created for this roll?
     * @returns {boolean}                   Explicitly return false to prevent the roll from being performed.
     */
    if ( Hooks.call("dnd5e.preRollRecharge", this, rollConfig) === false ) return;

    const roll = await new Roll(rollConfig.formula, rollConfig.data).roll({async: true});
    const success = roll.total >= rollConfig.target;

    if ( rollConfig.chatMessage ) {
      const resultMessage = game.i18n.localize(`DND5E.ItemRecharge${success ? "Success" : "Failure"}`);
      roll.toMessage({
        flavor: `${game.i18n.format("DND5E.ItemRechargeCheck", {name: this.name})} - ${resultMessage}`,
        speaker: ChatMessage.getSpeaker({actor: this.actor, token: this.actor.token})
      });
    }

    /**
     * A hook event that fires after the Item has rolled to recharge, but before any changes have been performed.
     * @function dnd5e.rollRecharge
     * @memberof hookEvents
     * @param {Item5e} item  Item for which the roll was performed.
     * @param {Roll} roll    The resulting roll.
     * @returns {boolean}    Explicitly return false to prevent the item from being recharged.
     */
    if ( Hooks.call("dnd5e.rollRecharge", this, roll) === false ) return roll;

    // Update the Item data
    if ( success ) this.update({"system.recharge.charged": true});

    return roll;
  }

  /* -------------------------------------------- */

  /**
   * Prepare data needed to roll a tool check and then pass it off to `d20Roll`.
   * @param {D20RollConfiguration} [options]  Roll configuration options provided to the d20Roll function.
   * @returns {Promise<Roll>}                 A Promise which resolves to the created Roll instance.
   */
  async rollToolCheck(options={}) {
    if ( this.type !== "tool" ) throw new Error("Wrong item type!");

    // Prepare roll data
    const rollData = this.getRollData();
    const abl = this.system.ability;
    const parts = ["@mod", "@abilityCheckBonus"];
    const title = `${this.name} - ${game.i18n.localize("DND5E.ToolCheck")}`;

    // Add proficiency
    if ( this.system.prof?.hasProficiency ) {
      parts.push("@prof");
      rollData.prof = this.system.prof.term;
    }

    // Add tool bonuses
    if ( this.system.bonus ) {
      parts.push("@toolBonus");
      rollData.toolBonus = Roll.replaceFormulaData(this.system.bonus, rollData);
    }

    // Add ability-specific check bonus
    const checkBonus = foundry.utils.getProperty(rollData, `abilities.${abl}.bonuses.check`);
    if ( checkBonus ) rollData.abilityCheckBonus = Roll.replaceFormulaData(checkBonus, rollData);
    else rollData.abilityCheckBonus = 0;

    // Add global actor bonus
    const globalBonus = this.actor.system.bonuses?.abilities || {};
    if ( globalBonus.check ) {
      parts.push("@checkBonus");
      rollData.checkBonus = Roll.replaceFormulaData(globalBonus.check, rollData);
    }

    // Compose the roll data
    const rollConfig = foundry.utils.mergeObject({
      data: rollData,
      title: title,
      flavor: title,
      dialogOptions: {
        width: 400,
        top: options.event ? options.event.clientY - 80 : null,
        left: window.innerWidth - 710
      },
      chooseModifier: true,
      halflingLucky: this.actor.getFlag("dnd5e", "halflingLucky" ),
      reliableTalent: (this.system.proficient >= 1) && this.actor.getFlag("dnd5e", "reliableTalent"),
      messageData: {
        speaker: options.speaker || ChatMessage.getSpeaker({actor: this.actor}),
        "flags.dnd5e.roll": {type: "tool", itemId: this.id, itemUuid: this.uuid}
      }
    }, options);
    rollConfig.parts = parts.concat(options.parts ?? []);

    /**
     * A hook event that fires before a tool check is rolled for an Item.
     * @function dnd5e.preRollToolCheck
     * @memberof hookEvents
     * @param {Item5e} item                  Item for which the roll is being performed.
     * @param {D20RollConfiguration} config  Configuration data for the pending roll.
     * @returns {boolean}                    Explicitly return false to prevent the roll from being performed.
     */
    if ( Hooks.call("dnd5e.preRollToolCheck", this, rollConfig) === false ) return;

    const roll = await d20Roll(rollConfig);

    /**
     * A hook event that fires after a tool check has been rolled for an Item.
     * @function dnd5e.rollToolCheck
     * @memberof hookEvents
     * @param {Item5e} item   Item for which the roll was performed.
     * @param {D20Roll} roll  The resulting roll.
     */
    if ( roll ) Hooks.callAll("dnd5e.rollToolCheck", this, roll);

    return roll;
  }

  /* -------------------------------------------- */

  /**
   * @inheritdoc
   * @param {object} [options]
   * @param {boolean} [options.deterministic] Whether to force deterministic values for data properties that could be
   *                                          either a die term or a flat term.
   */
  getRollData({ deterministic=false }={}) {
    if ( !this.actor ) return null;
    const actorRollData = this.actor.getRollData({ deterministic });
    const rollData = {
      ...actorRollData,
      item: this.toObject().system
    };

    // Include an ability score modifier if one exists
    const abl = this.abilityMod;
    if ( abl && ("abilities" in rollData) ) {
      const ability = rollData.abilities[abl];
      if ( !ability ) {
        console.warn(`Item ${this.name} in Actor ${this.actor.name} has an invalid item ability modifier of ${abl} defined`);
      }
      rollData.mod = ability?.mod ?? 0;
    }
    return rollData;
  }

  /* -------------------------------------------- */
  /*  Chat Message Helpers                        */
  /* -------------------------------------------- */

  /**
   * Apply listeners to chat messages.
   * @param {HTML} html  Rendered chat message.
   */
  static chatListeners(html) {
    html.on("click", ".card-buttons button", this._onChatCardAction.bind(this));
    html.on("click", ".item-name", this._onChatCardToggleContent.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle execution of a chat card action via a click event on one of the card buttons
   * @param {Event} event       The originating click event
   * @returns {Promise}         A promise which resolves once the handler workflow is complete
   * @private
   */
  static async _onChatCardAction(event) {
    event.preventDefault();

    // Extract card data
    const button = event.currentTarget;
    button.disabled = true;
    const card = button.closest(".chat-card");
    const messageId = card.closest(".message").dataset.messageId;
    const message = game.messages.get(messageId);
    const action = button.dataset.action;

    // Recover the actor for the chat card
    const actor = await this._getChatCardActor(card);
    if ( !actor ) return;

    // Validate permission to proceed with the roll
    const isTargetted = action === "save";
    if ( !( isTargetted || game.user.isGM || actor.isOwner ) ) return;

    // Get the Item from stored flag data or by the item ID on the Actor
    const storedData = message.getFlag("dnd5e", "itemData");
    const item = storedData ? new this(storedData, {parent: actor}) : actor.items.get(card.dataset.itemId);
    if ( !item ) {
      const err = game.i18n.format("DND5E.ActionWarningNoItem", {item: card.dataset.itemId, name: actor.name});
      return ui.notifications.error(err);
    }
    const spellLevel = parseInt(card.dataset.spellLevel) || null;

    // Handle different actions
    let targets;
    switch ( action ) {
      case "attack":
        await item.rollAttack({
          event: event,
          spellLevel: spellLevel
        });
        break;
      case "damage":
      case "versatile":
        await item.rollDamage({
          event: event,
          spellLevel: spellLevel,
          versatile: action === "versatile"
        });
        break;
      case "formula":
        await item.rollFormula({event, spellLevel}); break;
      case "save":
        targets = this._getChatCardTargets(card);
        for ( let token of targets ) {
          const speaker = ChatMessage.getSpeaker({scene: canvas.scene, token: token.document});
          await token.actor.rollAbilitySave(button.dataset.ability, { event, speaker });
        }
        break;
      case "toolCheck":
        await item.rollToolCheck({event}); break;
      case "placeTemplate":
        try {
          await dnd5e.canvas.AbilityTemplate.fromItem(item)?.drawPreview();
        } catch(err) {}
        break;
      case "abilityCheck":
        targets = this._getChatCardTargets(card);
        for ( let token of targets ) {
          const speaker = ChatMessage.getSpeaker({scene: canvas.scene, token: token.document});
          await token.actor.rollAbilityTest(button.dataset.ability, { event, speaker });
        }
        break;
    }

    // Re-enable the button
    button.disabled = false;
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the visibility of chat card content when the name is clicked
   * @param {Event} event   The originating click event
   * @private
   */
  static _onChatCardToggleContent(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const card = header.closest(".chat-card");
    const content = card.querySelector(".card-content");
    content.style.display = content.style.display === "none" ? "block" : "none";
  }

  /* -------------------------------------------- */

  /**
   * Get the Actor which is the author of a chat card
   * @param {HTMLElement} card    The chat card being used
   * @returns {Actor|null}        The Actor document or null
   * @private
   */
  static async _getChatCardActor(card) {

    // Case 1 - a synthetic actor from a Token
    if ( card.dataset.tokenId ) {
      const token = await fromUuid(card.dataset.tokenId);
      if ( !token ) return null;
      return token.actor;
    }

    // Case 2 - use Actor ID directory
    const actorId = card.dataset.actorId;
    return game.actors.get(actorId) || null;
  }

  /* -------------------------------------------- */

  /**
   * Get the Actor which is the author of a chat card
   * @param {HTMLElement} card    The chat card being used
   * @returns {Actor[]}            An Array of Actor documents, if any
   * @private
   */
  static _getChatCardTargets(card) {
    let targets = canvas.tokens.controlled.filter(t => !!t.actor);
    if ( !targets.length && game.user.character ) targets = targets.concat(game.user.character.getActiveTokens());
    if ( !targets.length ) ui.notifications.warn(game.i18n.localize("DND5E.ActionWarningNoToken"));
    return targets;
  }

  /* -------------------------------------------- */
  /*  Advancements                                */
  /* -------------------------------------------- */

  /**
   * Create a new advancement of the specified type.
   * @param {string} type                          Type of advancement to create.
   * @param {object} [data]                        Data to use when creating the advancement.
   * @param {object} [options]
   * @param {boolean} [options.showConfig=true]    Should the new advancement's configuration application be shown?
   * @param {boolean} [options.source=false]       Should a source-only update be performed?
   * @returns {Promise<AdvancementConfig>|Item5e}  Promise for advancement config for new advancement if local
   *                                               is `false`, or item with newly added advancement.
   */
  createAdvancement(type, data={}, { showConfig=true, source=false }={}) {
    if ( !this.system.advancement ) return this;

    const Advancement = CONFIG.DND5E.advancementTypes[type];
    if ( !Advancement ) throw new Error(`${type} not found in CONFIG.DND5E.advancementTypes`);

    if ( !Advancement.metadata.validItemTypes.has(this.type) || !Advancement.availableForItem(this) ) {
      throw new Error(`${type} advancement cannot be added to ${this.name}`);
    }

    const advancement = new Advancement(data, {parent: this});
    const advancementCollection = this.toObject().system.advancement;
    advancementCollection.push(advancement.toObject());
    if ( source ) return this.updateSource({"system.advancement": advancementCollection});
    return this.update({"system.advancement": advancementCollection}).then(() => {
      if ( !showConfig ) return this;
      const config = new Advancement.metadata.apps.config(this.advancement.byId[advancement.id]);
      return config.render(true);
    });
  }

  /* -------------------------------------------- */

  /**
   * Update an advancement belonging to this item.
   * @param {string} id                       ID of the advancement to update.
   * @param {object} updates                  Updates to apply to this advancement.
   * @param {object} [options={}]
   * @param {boolean} [options.source=false]  Should a source-only update be performed?
   * @returns {Promise<Item5e>|Item5e}        This item with the changes applied, promised if source is `false`.
   */
  updateAdvancement(id, updates, { source=false }={}) {
    if ( !this.system.advancement ) return this;
    const idx = this.system.advancement.findIndex(a => a._id === id);
    if ( idx === -1 ) throw new Error(`Advancement of ID ${id} could not be found to update`);

    const advancement = this.advancement.byId[id];
    advancement.updateSource(updates);
    if ( source ) {
      advancement.render();
      return this;
    }

    const advancementCollection = this.toObject().system.advancement;
    advancementCollection[idx] = advancement.toObject();
    return this.update({"system.advancement": advancementCollection}).then(r => {
      advancement.render();
      return r;
    });
  }

  /* -------------------------------------------- */

  /**
   * Remove an advancement from this item.
   * @param {string} id                       ID of the advancement to remove.
   * @param {object} [options={}]
   * @param {boolean} [options.source=false]  Should a source-only update be performed?
   * @returns {Promise<Item5e>|Item5e}        This item with the changes applied.
   */
  deleteAdvancement(id, { source=false }={}) {
    if ( !this.system.advancement ) return this;

    const advancementCollection = this.system.advancement.filter(a => a._id !== id);
    if ( source ) return this.updateSource({"system.advancement": advancementCollection});
    return this.update({"system.advancement": advancementCollection});
  }

  /* -------------------------------------------- */

  /**
   * Duplicate an advancement, resetting its value to default and giving it a new ID.
   * @param {string} id                             ID of the advancement to duplicate.
   * @param {object} [options]
   * @param {boolean} [options.showConfig=true]     Should the new advancement's configuration application be shown?
   * @param {boolean} [options.source=false]        Should a source-only update be performed?
   * @returns {Promise<AdvancementConfig>|Item5e}   Promise for advancement config for duplicate advancement if source
   *                                                is `false`, or item with newly duplicated advancement.
   */
  duplicateAdvancement(id, options) {
    const original = this.advancement.byId[id];
    if ( !original ) return this;
    const duplicate = original.toObject();
    delete duplicate._id;
    if ( original.constructor.metadata.dataModels?.value ) {
      duplicate.value = (new original.constructor.metadata.dataModels.value()).toObject();
    } else {
      duplicate.value = original.constructor.metadata.defaults?.value ?? {};
    }
    return this.createAdvancement(original.constructor.typeName, duplicate, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getEmbeddedDocument(embeddedName, id, options) {
    if ( embeddedName !== "Advancement" ) return super.getEmbeddedDocument(embeddedName, id, options);
    const advancement = this.advancement.byId[id];
    if ( options?.strict && (advancement === undefined) ) {
      throw new Error(`The key ${id} does not exist in the ${embeddedName} Collection`);
    }
    return advancement;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Create class identifier based on name
    if ( ["class", "subclass"].includes(this.type) && !this.system.identifier ) {
      await this.updateSource({ "system.identifier": data.name.slugify({strict: true}) });
    }

    if ( !this.isEmbedded || (this.parent.type === "vehicle") ) return;
    const isNPC = this.parent.type === "npc";
    let updates;
    switch (data.type) {
      case "equipment":
        updates = this._onCreateOwnedEquipment(data, isNPC);
        break;
      case "spell":
        updates = this._onCreateOwnedSpell(data, isNPC);
        break;
      case "tool":
        updates = this._onCreateOwnedTool(data, isNPC);
        break;
      case "weapon":
        updates = this._onCreateOwnedWeapon(data, isNPC);
        break;
    }
    if ( updates ) return this.updateSource(updates);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( (userId !== game.user.id) || !this.parent ) return;

    // Assign a new original class
    if ( (this.parent.type === "character") && (this.type === "class") ) {
      const pc = this.parent.items.get(this.parent.system.details.originalClass);
      if ( !pc ) await this.parent._assignPrimaryClass();
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    if ( (this.type !== "class") || !("levels" in (changed.system || {})) ) return;

    // Check to make sure the updated class level isn't below zero
    if ( changed.system.levels <= 0 ) {
      ui.notifications.warn(game.i18n.localize("DND5E.MaxClassLevelMinimumWarn"));
      changed.system.levels = 1;
    }

    // Check to make sure the updated class level doesn't exceed level cap
    if ( changed.system.levels > CONFIG.DND5E.maxLevel ) {
      ui.notifications.warn(game.i18n.format("DND5E.MaxClassLevelExceededWarn", {max: CONFIG.DND5E.maxLevel}));
      changed.system.levels = CONFIG.DND5E.maxLevel;
    }
    if ( !this.isEmbedded || (this.parent.type !== "character") ) return;

    // Check to ensure the updated character doesn't exceed level cap
    const newCharacterLevel = this.actor.system.details.level + (changed.system.levels - this.system.levels);
    if ( newCharacterLevel > CONFIG.DND5E.maxLevel ) {
      ui.notifications.warn(game.i18n.format("DND5E.MaxCharacterLevelExceededWarn", {max: CONFIG.DND5E.maxLevel}));
      changed.system.levels -= newCharacterLevel - CONFIG.DND5E.maxLevel;
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( (userId !== game.user.id) || !this.parent ) return;

    // Assign a new original class
    if ( (this.type === "class") && (this.id === this.parent.system.details.originalClass) ) {
      this.parent._assignPrimaryClass();
    }
  }

  /* -------------------------------------------- */

  /**
   * Pre-creation logic for the automatic configuration of owned equipment type Items.
   *
   * @param {object} data       Data for the newly created item.
   * @param {boolean} isNPC     Is this actor an NPC?
   * @returns {object}          Updates to apply to the item data.
   * @private
   */
  _onCreateOwnedEquipment(data, isNPC) {
    const updates = {};
    if ( foundry.utils.getProperty(data, "system.equipped") === undefined ) {
      updates["system.equipped"] = isNPC;  // NPCs automatically equip equipment
    }
    if ( foundry.utils.getProperty(data, "system.proficient") === undefined ) {
      if ( isNPC ) {
        updates["system.proficient"] = true;  // NPCs automatically have equipment proficiency
      } else {
        const armorProf = CONFIG.DND5E.armorProficienciesMap[this.system.armor?.type]; // Player characters check proficiency
        const actorArmorProfs = this.parent.system.traits?.armorProf?.value || new Set();
        updates["system.proficient"] = (armorProf === true) || actorArmorProfs.has(armorProf)
          || actorArmorProfs.has(this.system.baseItem);
      }
    }
    return updates;
  }

  /* -------------------------------------------- */

  /**
   * Pre-creation logic for the automatic configuration of owned spell type Items.
   *
   * @param {object} data       Data for the newly created item.
   * @param {boolean} isNPC     Is this actor an NPC?
   * @returns {object}          Updates to apply to the item data.
   * @private
   */
  _onCreateOwnedSpell(data, isNPC) {
    const updates = {};
    if ( foundry.utils.getProperty(data, "system.preparation.prepared") === undefined ) {
      updates["system.preparation.prepared"] = isNPC; // NPCs automatically prepare spells
    }
    return updates;
  }

  /* -------------------------------------------- */

  /**
   * Pre-creation logic for the automatic configuration of owned tool type Items.
   * @param {object} data       Data for the newly created item.
   * @param {boolean} isNPC     Is this actor an NPC?
   * @returns {object}          Updates to apply to the item data.
   * @private
   */
  _onCreateOwnedTool(data, isNPC) {
    const updates = {};
    if ( data.system?.proficient === undefined ) {
      if ( isNPC ) updates["system.proficient"] = 1;
      else {
        const actorToolProfs = this.parent.system.traits?.toolProf?.value || new Set();
        const proficient = actorToolProfs.has(this.system.toolType) || actorToolProfs.has(this.system.baseItem);
        updates["system.proficient"] = Number(proficient);
      }
    }
    return updates;
  }

  /* -------------------------------------------- */

  /**
   * Pre-creation logic for the automatic configuration of owned weapon type Items.
   * @param {object} data       Data for the newly created item.
   * @param {boolean} isNPC     Is this actor an NPC?
   * @returns {object}          Updates to apply to the item data.
   * @private
   */
  _onCreateOwnedWeapon(data, isNPC) {

    // NPCs automatically equip items and are proficient with them
    if ( isNPC ) {
      const updates = {};
      if ( !foundry.utils.hasProperty(data, "system.equipped") ) updates["system.equipped"] = true;
      if ( !foundry.utils.hasProperty(data, "system.proficient") ) updates["system.proficient"] = true;
      return updates;
    }
    if ( data.system?.proficient !== undefined ) return {};

    // Some weapon types are always proficient
    const weaponProf = CONFIG.DND5E.weaponProficienciesMap[this.system.weaponType];
    const updates = {};
    if ( weaponProf === true ) updates["system.proficient"] = true;

    // Characters may have proficiency in this weapon type (or specific base weapon)
    else {
      const actorProfs = this.parent.system.traits?.weaponProf?.value || new Set();
      updates["system.proficient"] = actorProfs.has(weaponProf) || actorProfs.has(this.system.baseItem);
    }
    return updates;
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Create a consumable spell scroll Item from a spell Item.
   * @param {Item5e} spell      The spell to be made into a scroll
   * @returns {Item5e}          The created scroll consumable item
   */
  static async createScrollFromSpell(spell) {

    // Get spell data
    const itemData = (spell instanceof Item5e) ? spell.toObject() : spell;
    let {
      actionType, description, source, activation, duration, target, range, damage, formula, save, level, attackBonus
    } = itemData.system;

    // Get scroll data
    const scrollUuid = `Compendium.${CONFIG.DND5E.sourcePacks.ITEMS}.${CONFIG.DND5E.spellScrollIds[level]}`;
    const scrollItem = await fromUuid(scrollUuid);
    const scrollData = scrollItem.toObject();
    delete scrollData._id;

    // Split the scroll description into an intro paragraph and the remaining details
    const scrollDescription = scrollData.system.description.value;
    const pdel = "</p>";
    const scrollIntroEnd = scrollDescription.indexOf(pdel);
    const scrollIntro = scrollDescription.slice(0, scrollIntroEnd + pdel.length);
    const scrollDetails = scrollDescription.slice(scrollIntroEnd + pdel.length);

    // Create a composite description from the scroll description and the spell details
    const desc = `${scrollIntro}<hr/><h3>${itemData.name} (Level ${level})</h3><hr/>${description.value}<hr/><h3>Scroll Details</h3><hr/>${scrollDetails}`;

    // Used a fixed attack modifier and saving throw according to the level of spell scroll.
    if ( ["mwak", "rwak", "msak", "rsak"].includes(actionType) ) {
      attackBonus = `${scrollData.system.attackBonus} - @mod`;
    }
    if ( save.ability ) {
      save.scaling = "flat";
      save.dc = scrollData.system.save.dc;
    }

    // Create the spell scroll data
    const spellScrollData = foundry.utils.mergeObject(scrollData, {
      name: `${game.i18n.localize("DND5E.SpellScroll")}: ${itemData.name}`,
      img: itemData.img,
      system: {
        "description.value": desc.trim(), source, actionType, activation, duration, target, range, damage, formula,
        save, level, attackBonus
      }
    });
    return new this(spellScrollData);
  }
}
