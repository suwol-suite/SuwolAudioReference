export const RELEASE_BASE_NAME = "SuwolAudioReference";
export const PRODUCT_NAME = "Suwol Audio Reference";
export const PACKAGE_NAME = "suwol-audio-reference";
export const APP_ID = "work.suwol.audio-reference";

export function releaseNames(version) {
  return {
    windowsZip: `${RELEASE_BASE_NAME}-${version}-win-x64.zip`,
    linuxZip: `${RELEASE_BASE_NAME}-${version}-linux-x64.zip`,
    linuxAppImage: `${RELEASE_BASE_NAME}-${version}-linux-x64.AppImage`,
    linuxLatest: "latest-linux.yml",
    macDmg: `${RELEASE_BASE_NAME}-${version}-mac-arm64.dmg`,
    macZip: `${RELEASE_BASE_NAME}-${version}-mac-arm64.zip`,
    macLatest: "latest-mac.yml",
    checksums: "checksums.txt",
    checksumsSignature: "checksums.txt.asc",
    versionedChecksums: `${RELEASE_BASE_NAME}-${version}-checksums.txt`,
    versionedChecksumsSignature: `${RELEASE_BASE_NAME}-${version}-checksums.txt.asc`,
    publicKey: "suwol-release-public-key.asc",
  };
}

export function releaseAssetNames(version) {
  const names = releaseNames(version);
  return [
    names.windowsZip,
    names.linuxZip,
    names.linuxAppImage,
    names.linuxLatest,
    names.macDmg,
    names.macZip,
    names.macLatest,
  ];
}

export function zipNameForTarget(version, target) {
  const names = releaseNames(version);
  if (target === "win") {
    return names.windowsZip;
  }
  if (target === "linux") {
    return names.linuxZip;
  }
  throw new Error(`Unknown release zip target: ${target}`);
}
