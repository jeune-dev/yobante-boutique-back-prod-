// ─────────────────────────────────────────────────────────────
// utils/schemaReconciliation.js — Écart entre les modèles et la base
//
// Jusqu'en août 2026, le schéma était créé par `sequelize.sync()`, qui ne
// crée que les TABLES manquantes : une colonne ajoutée à un modèle après la
// création de sa table n'existe en base que si une migration l'ajoute. Les
// migrations historiques ont en outre été marquées « appliquées » sans être
// jouées (scripts/seed-legacy-migrations.js). Toute requête qui sélectionne
// une colonne absente échoue alors en 500 (« column … does not exist »).
//
// `analyserSchema` liste les écarts (tables, colonnes, valeurs d'ENUM) ;
// `reconcilierSchema` ajoute ce qui manque. Uniquement additif : aucune
// colonne, table ou donnée n'est supprimée ni modifiée.
// ─────────────────────────────────────────────────────────────
const { DataTypes } = require('sequelize');

const nomTable = (model) => {
  const t = model.getTableName();
  return typeof t === 'string' ? t : t.tableName;
};

const estEnum = (type) => type instanceof DataTypes.ENUM || type?.key === 'ENUM';

/** Nom du type PostgreSQL créé par Sequelize pour une colonne ENUM. */
const nomTypeEnum = (table, colonne) => `enum_${table}_${colonne}`;

async function tablesExistantes(sequelize) {
  const rows = await sequelize.query(
    // Alias obligatoire : Sequelize détourne toute requête commençant par
    // « SELECT table_name FROM information_schema.tables » (showAllTables).
    `SELECT table_name AS nom FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return new Set(rows.map((r) => r.nom));
}

async function colonnesExistantes(sequelize, table) {
  const rows = await sequelize.query(
    `SELECT column_name AS nom FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = :table`,
    { replacements: { table }, type: sequelize.QueryTypes.SELECT }
  );
  return new Set(rows.map((r) => r.nom));
}

async function valeursEnum(sequelize, typeName) {
  const rows = await sequelize.query(
    `SELECT e.enumlabel AS valeur FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = :typeName`,
    { replacements: { typeName }, type: sequelize.QueryTypes.SELECT }
  );
  return rows.length ? new Set(rows.map((r) => r.valeur)) : null;
}

/**
 * Compare les modèles chargés sur `sequelize` avec la base.
 * @returns {{ tablesManquantes: string[], colonnesManquantes: object[], valeursEnumManquantes: object[] }}
 */
async function analyserSchema(sequelize) {
  const ecarts = { tablesManquantes: [], colonnesManquantes: [], valeursEnumManquantes: [] };
  const tables = await tablesExistantes(sequelize);

  for (const model of Object.values(sequelize.models)) {
    const table = nomTable(model);
    if (!tables.has(table)) {
      ecarts.tablesManquantes.push(table);
      continue;
    }
    const colonnes = await colonnesExistantes(sequelize, table);
    for (const [attribut, def] of Object.entries(model.rawAttributes)) {
      if (def.type instanceof DataTypes.VIRTUAL) continue;
      const colonne = def.field || attribut;
      if (!colonnes.has(colonne)) {
        ecarts.colonnesManquantes.push({ model: model.name, table, colonne, attribut });
        continue;
      }
      if (estEnum(def.type)) {
        const typeName = nomTypeEnum(table, colonne);
        const existantes = await valeursEnum(sequelize, typeName);
        // Colonne ENUM stockée autrement (VARCHAR…) : rien à compléter.
        if (!existantes) continue;
        for (const valeur of def.type.values) {
          if (!existantes.has(valeur)) {
            ecarts.valeursEnumManquantes.push({ table, colonne, typeName, valeur });
          }
        }
      }
    }
  }
  return ecarts;
}

/** Définition `addColumn` d'un attribut de modèle, sans contrainte risquée. */
function definitionColonne(def, tableVide) {
  const definition = { type: def.type };
  if (def.comment) definition.comment = def.comment;
  const defaut = def.defaultValue;
  // UUIDV4 / UUIDV1 sont générés par Sequelize côté application, pas par la base.
  const defautSql =
    defaut !== undefined &&
    !(defaut instanceof DataTypes.UUIDV4) &&
    !(defaut instanceof DataTypes.UUIDV1) &&
    typeof defaut !== 'function';
  if (defautSql) definition.defaultValue = defaut;
  // NOT NULL sans valeur par défaut sur une table peuplée : impossible sans
  // inventer une valeur. La colonne est ajoutée nullable (signalé au journal).
  definition.allowNull = def.allowNull !== false || (!defautSql && !tableVide);
  return definition;
}

/**
 * Ajoute les valeurs d'ENUM et colonnes manquantes, puis laisse
 * `sequelize.sync()` créer les tables et index manquants — ce qu'il ne
 * pouvait pas faire tant qu'un index portait sur une colonne absente (le
 * sync échouait alors avant d'atteindre les tables suivantes).
 * @returns le détail de ce qui a été ajouté.
 */
async function reconcilierSchema(sequelize, { log = () => {} } = {}) {
  const ecarts = await analyserSchema(sequelize);
  const qi = sequelize.getQueryInterface();
  const ajoutes = { tables: [], colonnes: [], valeursEnum: [], avertissements: [] };

  for (const { typeName, valeur, table, colonne } of ecarts.valeursEnumManquantes) {
    const litteral = sequelize.escape(valeur);
    await sequelize.query(`ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS ${litteral}`);
    ajoutes.valeursEnum.push(`${table}.${colonne} += ${valeur}`);
    log(`ENUM ${typeName} : valeur « ${valeur} » ajoutée`);
  }

  for (const { model: nomModele, table, colonne, attribut } of ecarts.colonnesManquantes) {
    const def = sequelize.models[nomModele].rawAttributes[attribut];
    const [{ n }] = await sequelize.query(`SELECT count(*)::int AS n FROM "${table}"`, {
      type: sequelize.QueryTypes.SELECT,
    });
    const definition = definitionColonne(def, n === 0);
    await qi.addColumn(table, colonne, definition);
    ajoutes.colonnes.push(`${table}.${colonne}`);
    if (def.allowNull === false && definition.allowNull) {
      const message = `${table}.${colonne} ajoutée NULLABLE (NOT NULL sans défaut, table non vide)`;
      ajoutes.avertissements.push(message);
      log(message);
    } else {
      log(`Colonne ${table}.${colonne} ajoutée`);
    }
  }

  // Tables et index manquants (additif : sync sans force ni alter).
  await sequelize.sync();
  const tablesApres = await tablesExistantes(sequelize);
  for (const table of ecarts.tablesManquantes) {
    if (tablesApres.has(table)) {
      ajoutes.tables.push(table);
      log(`Table ${table} créée`);
    }
  }
  return ajoutes;
}

module.exports = { analyserSchema, reconcilierSchema };
