// F2: keyword biasing. Transcribe accepts `keywords` to nudge recognition
// towards domain words it might otherwise mishear ("ramekin" as "ram again").
// The domain hint comes from the upload form ("cooking", "bike repair").
// Biasing improves the odds; it does not guarantee spelling.

const KEYWORDS_BY_DOMAIN: Record<string, string[]> = {
  cooking: [
    "whisk", "spatula", "ladle", "colander", "saucepan", "skillet", "ramekin",
    "teaspoon", "tablespoon", "measuring cup", "mixing bowl", "baking tray",
    "flour", "baking powder", "bicarbonate of soda", "caster sugar", "batter", "dough",
  ],
  "bike repair": [
    "derailleur", "chainring", "cassette", "hex key", "Allen key", "tyre lever",
    "inner tube", "valve", "brake pad", "cable", "spoke", "quick release",
  ],
  crafts: [
    "glue gun", "craft knife", "cutting mat", "embroidery hoop", "crochet hook",
    "knitting needle", "yarn", "felt", "pliers", "jump ring",
  ],
  assembly: [
    "Allen key", "hex key", "dowel", "cam lock", "screwdriver", "Phillips",
    "flathead", "bracket", "washer", "wing nut",
  ],
};

export function keywordsForDomain(domainHint: string | null): string[] {
  if (!domainHint) return [];
  return KEYWORDS_BY_DOMAIN[domainHint.trim().toLowerCase()] ?? [];
}

export const KNOWN_DOMAINS = Object.keys(KEYWORDS_BY_DOMAIN);
