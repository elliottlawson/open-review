# Preset: Vue

## Version Detection
- Read `package.json` → `dependencies.vue` to determine version
- Check for Composition API usage (`<script setup>`)
- Check for TypeScript (`typescript` in devDependencies)

## Framework Patterns to Verify
When reviewing Vue code, check:
- **Composition API**: Are composables used for shared logic? Proper reactivity?
- **Components**: Are components properly decomposed? Props/emits defined?
- **Reactivity**: Are ref/reactive used correctly? No unnecessary reactivity?
- **Computed/Watch**: Are computed properties pure? Watchers properly cleaned up?
- **TypeScript**: Are props properly typed with defineProps<T>()?

## Common Pitfalls to Flag
- Using Options API when Composition API is available
- Missing key props in v-for
- Direct DOM manipulation instead of refs
- Unnecessary watchers when computed would work
- Not using shallowRef for large objects
- Missing error boundaries (onErrorCaptured)

## Documentation References
When flagging framework deviations, link to the relevant Vue docs:
- "See https://vuejs.org/guide/introduction.html"
- "See https://vuejs.org/guide/extras/composition-api-faq.html"
