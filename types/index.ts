/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "@/public/static/charting_library" {
  export type ResolutionString = string;
  export type LanguageCode = string;

  export interface ChartingLibraryWidgetOptions {
    [key: string]: any;
  }

  export const Datafeeds: any;
  export const widget: any;

  export default widget;
}
