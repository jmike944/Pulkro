import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Guards for findings the reviews kept repeating (docs/CONVENTIONS.md, "Definition of done").
    name: "pulkro/guards",
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      // jsx-a11y's whole recommended set, as errors (eslint-config-next turns on six of its rules, as warnings). Rules only:
      // the plugin is the copy eslint-config-next registers, and registering a second one is a "Cannot redefine plugin" error.
      ...jsxA11y.flatConfigs.recommended.rules,
      // next/image's <Image> is an <img> too (as eslint-config-next checks it).
      "jsx-a11y/alt-text": ["error", { img: ["Image"] }],
      // A <label> wrapping one of these labels it: they render a native input or a <button role="switch|radio|checkbox">
      // (labelable elements). SwitchLite's `label` prop is its aria-label. The range input in storage-calculator sits three
      // levels down.
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: ["Input", "Textarea", "Checkbox", "Switch", "SwitchLite", "RadioGroupItem"],
          labelAttributes: ["label"],
          depth: 3,
        },
      ],
      // A dependency left out reads a stale value once what it depends on changes (an account, a photo, a token).
      "react-hooks/exhaustive-deps": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MapLibre's worker, copied by scripts/vendor-maplibre.mjs (predev/prebuild; git-ignored).
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
