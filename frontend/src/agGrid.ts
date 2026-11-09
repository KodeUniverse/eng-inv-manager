import { AllCommunityModule, colorSchemeDark, colorSchemeLight, ModuleRegistry, themeQuartz } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

export const gridThemes = {
  dark: themeQuartz.withPart(colorSchemeDark),
  light: themeQuartz.withPart(colorSchemeLight),
}
