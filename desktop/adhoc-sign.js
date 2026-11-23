// توقيع محلي (ad-hoc) لتطبيق ماك بعد التحزيم وقبل إنشاء dmg.
// macOS on Apple silicon refuses to run an app whose code signature is missing or broken
// (it reports the app as "damaged"). Without a paid Apple certificate, an ad-hoc signature
// is enough for the app to open after the usual "unidentified developer" confirmation.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  // universal builds package x64 and arm64 into *-temp folders first and merge them afterwards:
  // sign only the final app, otherwise the merge sees different signature files and fails
  if (/-temp$/.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing  ${app}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { stdio: "inherit" });
};
