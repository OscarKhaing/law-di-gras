// Links into Clio Manage for the reader to open in a new tab. Case Desk only reads Clio; these are
// plain links to Clio's own web app.

const APP = "https://app.clio.com/nc/#";

/** The matter in Clio's web app. */
export function clioMatterUrl(matterId: number) {
  return `${APP}/matters/${matterId}`;
}
