// Seeds the amenities catalogue. Safe to run more than once:
// existing codes are left alone, new ones are added.
// Run with: npx tsx src/db/seeds/amenities.ts  (adjust the path to yours)

import { db } from "../../config/db";
import { amenities, NewAmenity } from "../schema/amenities";

const catalogue: NewAmenity[] = [
  // Power
  { code: "generator", label: "Generator", category: "power" },
  { code: "solar", label: "Solar power system", category: "power" },
  { code: "inverter", label: "Inverter", category: "power" },
  { code: "prepaid_meter", label: "Prepaid meter", category: "power" },

  // Water
  { code: "borehole", label: "Borehole", category: "water" },
  { code: "water_treatment", label: "Water treatment", category: "water" },
  { code: "water_heater", label: "Water heater", category: "water" },

  // Security
  { code: "security_guard", label: "Security guard", category: "security" },
  { code: "gated_estate", label: "Gated estate", category: "security" },
  { code: "cctv", label: "CCTV", category: "security" },
  { code: "fence", label: "Perimeter fence", category: "security" },

  // Structure
  { code: "balcony", label: "Balcony", category: "structure" },
  { code: "boys_quarters", label: "Boys' quarters", category: "structure" },
  { code: "en_suite", label: "En-suite bedrooms", category: "structure" },
  { code: "pop_ceiling", label: "POP ceiling", category: "structure" },
  { code: "tiled_floors", label: "Tiled floors", category: "structure" },
  { code: "fitted_kitchen", label: "Fitted kitchen", category: "structure" },
  { code: "wardrobe", label: "Built-in wardrobe", category: "structure" },

  // Comfort
  { code: "air_conditioning", label: "Air conditioning", category: "comfort" },
  { code: "swimming_pool", label: "Swimming pool", category: "comfort" },
  { code: "gym", label: "Gym", category: "comfort" },
  { code: "waste_disposal", label: "Waste disposal", category: "comfort" },
];

async function main() {
  await db
    .insert(amenities)
    .values(catalogue)
    .onConflictDoNothing({ target: amenities.code });
  console.log(`Amenities seeded (${catalogue.length} in catalogue)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
