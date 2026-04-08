declare module "negotiator" {
  interface NegotiatorHeaders {
    [header: string]: string | string[] | undefined;
  }

  interface NegotiatorOptions {
    headers?: NegotiatorHeaders;
  }

  export default class Negotiator {
    constructor(options?: NegotiatorOptions);
    languages(availableLanguages?: readonly string[]): string[];
  }
}
