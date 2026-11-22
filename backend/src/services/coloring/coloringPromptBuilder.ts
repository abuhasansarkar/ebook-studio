import type { ColoringAudience, ColoringDifficulty, ColoringLineThickness, ColoringStyle } from "@ebook/shared";

export interface PromptContext {
  title: string;
  topic: string;
  artStyle: ColoringStyle;
  targetAudience: ColoringAudience;
  difficulty: ColoringDifficulty;
  lineThickness: ColoringLineThickness;
  sceneTitle: string;
  scenePrompt: string;
  negativePrompt?: string | null;
}

const STYLE_INSTRUCTIONS: Record<ColoringStyle, string> = {
  kawaii_chibi:
    "Art Style: Kawaii Chibi. Adorable character proportions, large expressive friendly eyes, rounded chunky shapes, clean sweet outlines, cheerful mood.",
  mandala_patterns:
    "Art Style: Intricate Mandala & Patterns. Symmetrical circular radial design, repeating geometric elements, elegant floral patterns, balanced therapeutic line art.",
  anime:
    "Art Style: Anime & Manga. Expressive character ink work, stylized hair and features, clean dynamic ink outlines, classic comic coloring book style.",
  bold_easy:
    "Art Style: Bold & Easy. Ultra-thick marker outlines (3-4px line weight), large open coloring spaces, simple contours, zero tiny clutter, beginner and toddler friendly.",
  florals_botanicals:
    "Art Style: Florals & Botanicals. Detailed plant contours, blooming flowers, elegant leaf veins, decorative garden composition, organic nature line art.",
  cute_animals:
    "Art Style: Cute Animals. Charming playful animals, friendly rounded anatomy, pleasant environmental elements like flowers, grass, or clouds.",
  fantasy_magical:
    "Art Style: Fantasy & Magical. Whimsical fairy tale scenes, unicorns, castles, magic dust, enchanted mushrooms, storybook line art.",
  dinosaurs:
    "Art Style: Dinosaurs. Playful prehistoric dinosaurs, tropical palm leaves, friendly prehistoric landscapes, clean printable contours.",
  ocean_sea_life:
    "Art Style: Ocean & Sea Life. Sea turtles, playful dolphins, tropical fish, coral formations, clean water bubbles and marine flora.",
  vehicles_machines:
    "Art Style: Vehicles & Machines. Distinct cars, trucks, airplanes, trains, clean mechanical contours, bold wheels and profile.",
  geometric_abstract:
    "Art Style: Geometric & Abstract. Symmetrical repeating patterns, modern line tessellations, optical balance, mindful coloring geometries.",
  fairy_tales:
    "Art Style: Fairytales & Folklore. Storybook castle scenes, enchanted forest cottages, royal carriages, timeless folklore line art.",
};

const AUDIENCE_LINE_RULES: Record<ColoringAudience, string> = {
  preschool:
    "Line Weight & Detail: Ultra-thick, bold black outlines. Very simple shapes with large empty areas for toddlers and preschoolers to color with thick crayons.",
  children:
    "Line Weight & Detail: Medium-thick crisp black outlines. Engaging scene elements, easy to color with colored pencils or markers.",
  teens:
    "Line Weight & Detail: Medium-fine ink outlines with engaging details and creative shading-friendly open contours.",
  adults:
    "Line Weight & Detail: Fine, intricate ink contours with detailed decorative motifs suitable for fine-tip pens and mindfulness coloring.",
};

const DIFFICULTY_RULES: Record<ColoringDifficulty, string> = {
  very_easy: "Composition: Very easy, minimal background elements, single prominent subject, spacious coloring zones.",
  easy: "Composition: Easy and straightforward, clear foreground subject with simple background context.",
  medium: "Composition: Balanced composition with well-defined background elements and rich coloring variety.",
  detailed: "Composition: Intricate and detailed composition filled with decorative elements and pattern fills.",
};

export function buildColoringPrompt(ctx: PromptContext): string {
  const parts = [
    `Black and white coloring book illustration for printing.`,
    `Subject: ${ctx.sceneTitle}.`,
    `Scene Description: ${ctx.scenePrompt}`,
    STYLE_INSTRUCTIONS[ctx.artStyle] || STYLE_INSTRUCTIONS.cute_animals,
    AUDIENCE_LINE_RULES[ctx.targetAudience] || AUDIENCE_LINE_RULES.children,
    DIFFICULTY_RULES[ctx.difficulty] || DIFFICULTY_RULES.easy,
    `Coloring Line Art Specifications:`,
    `- Background: Solid, pure white paper background (#FFFFFF). Absolutely zero background textures, zero gray wash, zero dark vignette.`,
    `- Lines: Crisp, continuous, solid pitch-black ink outlines (#000000). Closed vector-like contours suitable for coloring.`,
    `- Exclusions: No colors, no colored pixels, no grayscale shading, no crosshatching, no halftones, no gradient fills.`,
    `- Composition: Centered layout with generous margins away from the edges. No cut-off subjects.`,
    `- Strict: No text, no letters, no words, no numbers, no captions, no watermarks, no artist signatures, no framing borders.`,
  ];

  if (ctx.negativePrompt) {
    parts.push(`Additional Exclusions: ${ctx.negativePrompt}`);
  }

  return parts.join("\n");
}
