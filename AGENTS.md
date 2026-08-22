# NOTA Agent Guidelines & Environment Rules

## Expo Version & Documentation
Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## Critical Technical Constraints (DO NOT VIOLATE)

### 1. No `react-native-reanimated` in Expo Go
- **DO NOT** import or use `react-native-reanimated` or `react-native-worklets` in this repository.
- The physical iOS Expo Go client used for testing cannot load Reanimated's TurboModules (`[Error: Exception in HostFunction: <unknown>]`).
- **Use:** Standard React Native primitives, pure JS animations (`requestAnimationFrame`), or React Native's built-in `Animated` API.

### 2. No Manual `babel.config.js`
- Expo SDK 50+ uses built-in Metro transformer presets.
- **DO NOT** create a manual `babel.config.js` unless explicitly configured with all top-level presets, as it breaks Metro bundling.

### 3. Debugging Principles
- **HostFunction / TurboModule Crashes:** When encountering `Exception in HostFunction: <unknown>` or native module crashes, do NOT treat it as a JS syntax error. Check native compatibility and git history.
- **Secondary Warning ("missing required default export"):** This Expo Router warning frequently occurs when an imported module throws an exception during initial evaluation. Fix the import/module crash to resolve the warning.
