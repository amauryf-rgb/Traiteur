import { db } from "./index";
import {
  allergens,
  cancellationPolicies,
  categories,
  establishments,
  legalEntities,
  paymentAccounts,
  productAllergens,
  productCapacityRules,
  products,
  staffMembers,
} from "./schema";

async function seed() {
  const [establishment] = await db
    .insert(establishments)
    .values({
      name: "LabTraiteur Da Michele",
      slug: "labtraiteur",
      tagline: "Traiteur italien, Peseux · Neuchâtel",
      accentColor: "#4A1B0C",
      onboardingStatus: "active",
    })
    .returning();

  // Deux sociétés distinctes (section 6 de la synthèse) : Michele possède le
  // Traiteur SA, Richard possède la Boutique Sàrl. Chacune a son propre
  // compte de paiement — jamais la plateforme ne détient les fonds.
  const [traiteurEntity, boutiqueEntity] = await db
    .insert(legalEntities)
    .values([
      {
        establishmentId: establishment.id,
        name: "LabTraiteur Da Michele SA",
        roleLabel: "Traiteur",
        isDefault: true,
        defaultOrderType: "traiteur",
      },
      {
        establishmentId: establishment.id,
        name: "LabTraiteur Boutique Sàrl",
        roleLabel: "Boutique",
        isDefault: false,
        defaultOrderType: "boutique",
      },
    ])
    .returning();

  // Comptes de paiement non encore connectés à un vrai PSP (pilote pré-intégration) —
  // présents pour que le parcours de commande simulé puisse s'exécuter de bout en bout.
  await db.insert(paymentAccounts).values([
    { legalEntityId: traiteurEntity.id, pspProvider: "stripe", externalAccountId: "pending", status: "pending" },
    { legalEntityId: boutiqueEntity.id, pspProvider: "stripe", externalAccountId: "pending", status: "pending" },
  ]);

  // Accès allégé côté interface pro (écran 10) : un code suffit, pas de
  // compte complet à créer par membre d'équipe. D'autres membres se gèrent
  // ensuite depuis l'écran Équipe (/pro/equipe), pas en dur ici.
  await db.insert(staffMembers).values([
    {
      establishmentId: establishment.id,
      legalEntityId: traiteurEntity.id,
      name: "Michele",
      initials: "MI",
      role: "owner",
      accessCode: "1234",
    },
    {
      establishmentId: establishment.id,
      legalEntityId: boutiqueEntity.id,
      name: "Richard",
      initials: "RI",
      role: "owner",
      accessCode: "5678",
    },
  ]);

  await db.insert(cancellationPolicies).values([
    { establishmentId: establishment.id, orderType: "boutique", refundableDaysBefore: 0, nonRefundableAfterHours: 2 },
    { establishmentId: establishment.id, orderType: "traiteur", refundableDaysBefore: 7, nonRefundableAfterHours: 48 },
  ]);

  const [antipasti, plats, dolci] = await db
    .insert(categories)
    .values([
      { establishmentId: establishment.id, name: "Antipasti", sortOrder: 1 },
      { establishmentId: establishment.id, name: "Plats", sortOrder: 2 },
      { establishmentId: establishment.id, name: "Dolci", sortOrder: 3 },
    ])
    .returning();

  const [gluten, lactose, oeufs] = await db
    .insert(allergens)
    .values([
      { establishmentId: establishment.id, label: "Gluten" },
      { establishmentId: establishment.id, label: "Lactose" },
      { establishmentId: establishment.id, label: "Œufs" },
    ])
    .returning();

  const [focaccia, bruschetta, lasagne, involtini, tiramisu, pannacotta] = await db
    .insert(products)
    .values([
      {
        establishmentId: establishment.id,
        categoryId: antipasti.id,
        name: "Focaccia farcie maison",
        description: "Jambon de Parme, roquette, burrata — pour 4 à 6 personnes.",
        priceAmount: "24.00",
      },
      {
        establishmentId: establishment.id,
        categoryId: antipasti.id,
        name: "Bruschetta al pomodoro",
        description: "Tomates confites, basilic, huile d'olive — la portion de 4.",
        priceAmount: "12.00",
        availableTraiteur: false,
      },
      {
        establishmentId: establishment.id,
        categoryId: plats.id,
        name: "Lasagne alla Bolognese",
        description: "Recette de Pompéi, sauce mijotée, béchamel maison — la portion.",
        priceAmount: "18.00",
      },
      {
        establishmentId: establishment.id,
        categoryId: plats.id,
        name: "Involtini di vitello",
        description: "Paupiettes de veau farcies, sauce au marsala — sur réservation.",
        priceAmount: "26.00",
        availableBoutique: false,
      },
      {
        establishmentId: establishment.id,
        categoryId: dolci.id,
        name: "Tiramisù nostro",
        description: "Mascarpone, café, cacao — la part individuelle.",
        priceAmount: "9.00",
      },
      {
        establishmentId: establishment.id,
        categoryId: dolci.id,
        name: "Panna cotta ai frutti di bosco",
        description: "Crème vanillée, coulis de fruits rouges.",
        priceAmount: "8.00",
      },
    ])
    .returning();

  await db.insert(productAllergens).values([
    { productId: focaccia.id, allergenId: gluten.id },
    { productId: focaccia.id, allergenId: lactose.id },
    { productId: bruschetta.id, allergenId: gluten.id },
    { productId: lasagne.id, allergenId: gluten.id },
    { productId: lasagne.id, allergenId: lactose.id },
    { productId: tiramisu.id, allergenId: lactose.id },
    { productId: tiramisu.id, allergenId: oeufs.id },
    { productId: pannacotta.id, allergenId: lactose.id },
  ]);

  // Démontre la gestion de capacité (écran 5) : au-delà de 15 parts sur un même
  // créneau, le tiramisù devient indisponible pour ce créneau côté client.
  await db.insert(productCapacityRules).values({
    productId: tiramisu.id,
    scope: "per_slot",
    maxQuantity: 15,
    alertThresholdPct: 80,
  });

  console.log(`Établissement créé : ${establishment.name} (${establishment.slug})`);
  console.log(`  ${involtini.name} : traiteur uniquement`);
  console.log(`  ${bruschetta.name} : boutique uniquement`);
  console.log("  Accès pro : code 1234 (Michele, propriétaire Traiteur SA) / 5678 (Richard, propriétaire Boutique Sàrl)");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
